/**
 * Module 4 visual pixel-diff — locked design vs. the real, logged-in app.
 *
 *   node scripts/pixdiff.mjs                 # all screens
 *   node scripts/pixdiff.mjs form photos     # only matching ids
 *   PORT=55233 node scripts/pixdiff.mjs
 *
 * Design side  : public/_dx/*.html (unpacked by scripts/build-designcheck.mjs)
 * App side     : http://seller.localhost:<port> with real session cookies
 * Output       : _shots/<id>.{design,app,diff}.png + _shots/report.json
 *
 * Screenshots are taken in headless Chrome over CDP — the in-app Browser pane
 * cannot composite frames while hidden, so its screenshot call times out.
 */
import fs from "node:fs";
import path from "node:path";
import { launchChrome, Session, sleep } from "./lib/cdp.mjs";
import { diff, contactSheet } from "./lib/pixels.mjs";
import { connect } from "./lib/dbx.mjs";
import { makeClient } from "./lib/session.mjs";

const PORT = process.env.PORT ?? "55233";
const APP_PUBLIC = `http://localhost:${PORT}`;
const APP_SELLER = `http://seller.localhost:${PORT}`;
const DESIGN = `http://localhost:${PORT}/_dx`;
const OUT = "_shots";
const VW = 390, VH = 760;
const only = process.argv.slice(2);

// Only a FULL run clears the output; a filtered run refreshes just its own
// screens, so re-checking one screen doesn't throw away the other nineteen.
if (!only.length) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- session ---
const { session: login } = makeClient(APP_PUBLIC);

const cookiesFor = (jar, domain) =>
  [...jar].map(([name, value]) => ({ name, value, domain, path: "/", httpOnly: true, secure: false }));

// ------------------------------------------------------------- design side ---
// Reaches into the prototype's React tree to drive it to an exact state, so the
// design screenshot is the same screen/variant the app screenshot shows.
// The prototype's state lives on the dc-runtime "logic" object hanging off the
// React error-boundary component (StreamableComponent.logic), not on a React
// component itself — so walk the fiber tree looking for that.
const DESIGN_DRIVER = `
(() => {
  const el = document.getElementById('dc-root');
  if (!el) return false;
  const key = Object.keys(el).find(k => k.startsWith('__reactContainer$'));
  if (!key) return false;
  const seen = new Set();
  const walk = (f) => {
    while (f) {
      if (seen.has(f)) return null;
      seen.add(f);
      const l = f.stateNode && f.stateNode.logic;
      if (l && l.state && 'screen' in l.state && typeof l.setState === 'function') return l;
      const r = walk(f.child);
      if (r) return r;
      f = f.sibling;
    }
    return null;
  };
  const logic = walk(el[key]);
  if (!logic) return false;
  window.__dc = logic;
  return true;
})()`;

// The prototype ships a floating DEV panel that is not part of the design.
const HIDE_DEV_TOOLBAR = `
(() => {
  let n = 0;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && cs.zIndex === '500') { el.style.display = 'none'; n++; }
  }
  return n;
})()`;

/** Freeze anything that would make two screenshots of the same screen differ. */
const FREEZE = `
(() => {
  const s = document.createElement('style');
  s.textContent = '*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important;caret-color:transparent !important}';
  document.head.appendChild(s);
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  return true;
})()`;

async function captureDesign(sess, spec) {
  await sess.goto(`${DESIGN}/${spec.page}.html#${spec.screen}`, { waitMs: 700 });
  const gotInstance = await sess.eval(DESIGN_DRIVER);
  if (!gotInstance) throw new Error(`could not reach the ${spec.page} prototype state`);
  const state = { screen: spec.screen, ...(spec.designState ?? {}) };
  await sess.eval(`window.__dc.setState(${JSON.stringify(state)}); true`);
  await sleep(500);
  if (spec.designAfter) { await sess.eval(spec.designAfter); await sleep(400); }
  await sess.eval(FREEZE);
  await sess.eval(HIDE_DEV_TOOLBAR); // after the last render, or it comes back
  await sleep(250);
  return sess.screenshot();
}

// The PWA install banner is chrome the design does not have; it would otherwise
// cover the bottom of every app screenshot. Dismissed the same way a user does.
const SUPPRESS_INSTALL_PROMPT = `localStorage.setItem('hz-install-dismissed','1'); true`;

/**
 * Resolves once the page has actually finished rendering its data.
 *
 * Three signals together, because no single one is enough: skeletons
 * (`animate-shimmer`, see components/ui/Skeleton.tsx), undecoded images, and a
 * quiet network. The network check is the important one — a screen with no
 * skeleton (the photo grid, for example) looks "settled" the instant it mounts,
 * so without it the harness screenshots an empty grid and reports it as a
 * design deviation.
 */
async function waitForContent(sess, maxMs = 30000) {
  const started = Date.now();
  let quietSince = null;
  let lastCount = -1;

  while (Date.now() - started < maxMs) {
    const state = await sess.eval(`
      (() => {
        const skel = document.querySelectorAll('.animate-shimmer, [aria-busy="true"]').length;
        const imgs = [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length;
        const reqs = performance.getEntriesByType('resource').length;
        return { busy: skel + imgs, reqs };
      })()`);

    if (state.reqs !== lastCount) {
      lastCount = state.reqs;
      quietSince = null;
    } else if (quietSince === null) {
      quietSince = Date.now();
    }

    // settled = nothing loading AND no new request for 800ms
    if (!state.busy && quietSince !== null && Date.now() - quietSince >= 800) return true;
    await sleep(200);
  }
  return false;
}

async function captureApp(sess, url, spec) {
  // Targets share one Chrome profile, so cookies set for a logged-in screen
  // would leak into the next "guest" screen and silently shoot the owner
  // variant of a public page.
  await sess.send("Network.clearBrowserCookies");
  if (spec.cookies) await sess.setCookies(spec.cookies);
  // Seed localStorage from the SAME ORIGIN but a different path, then navigate
  // to the target exactly once. Loading the target twice made Chrome restore
  // the previous scroll offset, which silently screenshotted the page
  // mid-scroll and reported it as a design deviation.
  const origin = new URL(url).origin;
  await sess.goto(`${origin}/_dx/blank.html`, { waitMs: 100 });
  await sess.eval(SUPPRESS_INSTALL_PROMPT).catch(() => {});
  if (spec.appPrep) await sess.eval(spec.appPrep).catch(() => {});
  await sess.eval(`history.scrollRestoration = 'manual'; true`).catch(() => {});
  await sess.goto(url, { waitMs: 400 });
  const settled = await waitForContent(sess, spec.appWaitMs ?? 30000);
  if (spec.appAfter) { await sess.eval(spec.appAfter); await sleep(900); }
  await sess.eval(FREEZE);
  // Chrome restores the scroll offset when the same URL is loaded twice, which
  // silently screenshots the page mid-scroll and reports it as a deviation.
  await sess.eval(`
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll('*')) if (el.scrollTop) el.scrollTop = 0;
    true`);
  await sleep(400);

  // Did we actually land on the screen we asked for? A dead session bounces to
  // /login and on to the public feed, and diffing THAT against the design
  // reports a meaningless percentage instead of surfacing the real problem.
  const landed = String(await sess.eval("location.href"));
  const want = new URL(url);
  const got = new URL(landed);
  const strip = (p) => p.replace(/\/$/, "");
  const redirected = got.origin !== want.origin || strip(got.pathname) !== strip(want.pathname);

  return { png: await sess.screenshot(), settled, landed, redirected };
}

// ----------------------------------------------------------------- screens ---
/**
 * `url` may be a function of the resolved fixture ids, so every app screenshot
 * points at a real database row rather than a hand-written placeholder.
 */
function screenMap(fx) {
  return [
    // ---- P5 · Creation A -------------------------------------------------
    // The plan WALL is the creation-flow gate (components/billing/PlanWall via
    // CreateEntry), not the standalone /plans catalogue — `?wall=1` forces it
    // so the shot doesn't depend on the actor having zero slots.
    { id: "01-plan-wall",   page: "P5", screen: "plan",     as: "ownerRole", url: `${APP_SELLER}/create?wall=1` },
    // These three need a seller who still HAS a slot, or CreateEntry correctly
    // shows the plan wall instead (seed-module4-states keeps one spare).
    { id: "02-post-type",   page: "P5", screen: "posttype", as: "ownerRole", url: `${APP_SELLER}/create` },
    { id: "03-prop-type",   page: "P5", screen: "proptype", as: "ownerRole", url: `${APP_SELLER}/create/type?kind=sell` },
    { id: "04-listing-form",page: "P5", screen: "form",     as: "ownerRole", url: `${APP_SELLER}/create/form?type=flat&kind=sell` },
    // The creation steps key off ?listing=<draft listing id>, not the
    // listing_drafts row — pointing them at a draft id renders an empty screen.
    { id: "05-photos",      page: "P5", screen: "photos",   as: "draftOwner",
      appPrep: `localStorage.removeItem('hz_photo_guide_seen'); true`,
      url: fx.draftId && `${APP_SELLER}/create/photos?listing=${fx.draftId}` },
    { id: "06-photo-editor",page: "P5", screen: "photos",   as: "draftOwner",
      designState: { sheet: "editor" },
      // open the ⋯ tile menu → Edit photo, the way the design gets there
      appAfter: `(() => {
        const m = document.querySelector('[aria-label="Photo options"]');
        if (!m) return false;
        m.click();
        return true;
      })()`,
      url: fx.draftId && `${APP_SELLER}/create/photos?listing=${fx.draftId}` },

    // ---- P6 · Creation B -------------------------------------------------
    { id: "07-preview",     page: "P6", screen: "preview",  as: "draftOwner",
      url: fx.draftId && `${APP_SELLER}/create/preview?listing=${fx.draftId}` },
    { id: "08-checkout",    page: "P6", screen: "checkout", as: "owner",   url: `${APP_SELLER}/checkout?plan=${fx.planCode ?? ""}` },
    { id: "09-success",     page: "P6", screen: "success",  as: "owner",   url: fx.liveListingId && `${APP_SELLER}/create/success?listing=${fx.liveListingId}` },
    { id: "10-requirement-form", page: "P6", screen: "reqform",  as: "owner",  url: `${APP_SELLER}/requirements/new` },
    { id: "11-project-form",     page: "P6", screen: "projform", as: "builder",url: `${APP_SELLER}/projects/new` },
    { id: "12-drafts",      page: "P6", screen: "drafts",   as: "draftOwner", url: `${APP_SELLER}/create/drafts` },
    // The edit FORM is /create/form?edit=<id>; /listings/<id> is the owner's
    // view of the detail screen, which is a different design (P4, not P6 S7).
    { id: "13-edit",        page: "P6", screen: "edit",     as: "owner",
      url: fx.liveListingId && `${APP_SELLER}/create/form?edit=${fx.liveListingId}` },

    // ---- P4 · Detail -----------------------------------------------------
    // The prototype defaults to role:'buyer' + promoted:true; the app screenshot
    // is a signed-out visitor looking at a listing with no boost, so pin both.
    { id: "14-property-detail", page: "P4", screen: "property", as: "guest",
      designState: { role: "guest", promoted: false },
      url: fx.liveListingId && `${APP_PUBLIC}/property/${fx.liveListingId}` },
    { id: "15-project-detail",  page: "P4", screen: "project",  as: "projectOwner",
      url: fx.liveProjectId && `${APP_SELLER}/projects/${fx.liveProjectId}` },
    { id: "16-requirement-detail", page: "P4", screen: "requirement", as: "requirementOwner",
      url: fx.liveRequirementId && `${APP_SELLER}/requirements/${fx.liveRequirementId}` },
    { id: "17-photo-viewer",    page: "P4", screen: "viewer",   as: "guest",
      designState: { role: "guest", promoted: false },
      // open the viewer the way a user does — tap the cover photo
      appAfter: `(() => { const el = document.querySelector('main img, [role="img"], img'); if (el) { el.click(); return true; } return false; })()`,
      url: fx.liveListingId && `${APP_PUBLIC}/property/${fx.liveListingId}` },
    { id: "18-sold-state",      page: "P4", screen: "sold",     as: "guest",
      designState: { role: "guest", status: "sold", promoted: false },
      url: fx.soldListingId && `${APP_PUBLIC}/property/${fx.soldListingId}` },
    // The owner's view of a non-live listing lives on the SELLER host — session
    // cookies are host-only, so the public /property/:id correctly 404s here.
    { id: "19-under-review",    page: "P4", screen: "property", as: "reviewOwner",
      designState: { role: "owner", status: "review", promoted: false },
      url: fx.reviewListingId && `${APP_SELLER}/listings/${fx.reviewListingId}` },
    { id: "20-error-404",       page: "P4", screen: "error",    as: "guest",
      designState: { errKind: "404" },
      url: `${APP_PUBLIC}/property/00000000-0000-0000-0000-000000000000` },
  ];
}

// -------------------------------------------------------------- fixtures -----
/**
 * Every fixture is a real row, and each one carries the phone of the account
 * that owns it — an owner-gated screen has to be shot as its actual owner or
 * the app (correctly) 404s and we would be diffing an error page.
 */
async function fixtures(sql) {
  const one = async (q, ...a) => (await sql.query(q, a)).rows[0] ?? {};
  const listing = (where) => one(
    `select l.id, p.phone from listings l join profiles p on p.id = l.profile_id
      where ${where} and l.deleted_at is null
      order by l.photo_count desc, l.created_at desc limit 1`,
  );
  const live = await listing(`l.status='live'`);
  const sold = await listing(`l.availability='sold'`);
  const review = await listing(`l.status='pending_review'`);
  // A draft LISTING (status='draft'), preferring one that already has photos —
  // the photo grid and the preview are only meaningful with some.
  const draft = await listing(`l.status='draft'`);
  const proj = await one(
    `select pr.id, p.phone from projects pr join profiles p on p.id = pr.profile_id
      where pr.status='live' limit 1`,
  );
  const req = await one(
    `select r.id, p.phone from requirements r join profiles p on p.id = r.profile_id
      where r.status='live' order by r.created_at desc limit 1`,
  );
  // The listing plan, not the cheapest catalog row (that is a proposal top-up).
  const plan = await one(`select code from plan_catalog where is_active and listing_quota > 0 order by price_paise asc limit 1`);
  return {
    live, sold, review, draft, proj, req, planCode: plan.code,
    liveListingId: live.id, soldListingId: sold.id, reviewListingId: review.id,
    draftId: draft.id, liveProjectId: proj.id, liveRequirementId: req.id,
  };
}

// ------------------------------------------------------------------- main ----
/**
 * This harness only works against `next dev`, for two deliberate reasons:
 *   - next.config.mjs drops 'unsafe-eval' from the CSP in production, and the
 *     unpacked design prototypes need it (Babel + the dc runtime compile JSX in
 *     the page), so every /_dx page renders blank under a production build;
 *   - the dev OTP provider refuses to run with NODE_ENV=production, so no
 *     actor can sign in.
 * Both are correct product behaviour — fail loudly rather than reporting 20
 * mystery diffs.
 */
{
  const probe = await fetch(`${APP_PUBLIC}/api/v1/listings/config`).catch(() => null);
  if (!probe) {
    console.error(`No server on ${APP_PUBLIC}. Start the dev server, then re-run with PORT=<its port>.`);
    process.exit(1);
  }
  const csp = probe.headers.get("content-security-policy") ?? "";
  if (csp && !csp.includes("unsafe-eval")) {
    console.error(
      `${APP_PUBLIC} looks like a PRODUCTION build (CSP has no 'unsafe-eval').\n` +
      `The design prototypes cannot execute there and dev OTP is disabled.\n` +
      `Run this against 'npm run dev' instead.`,
    );
    process.exit(1);
  }
}

const sql = await connect();
const fx = await fixtures(sql);
console.log("fixtures:");
for (const k of ["live", "sold", "review", "draft", "proj", "req"]) {
  console.log(`  ${k.padEnd(7)} ${fx[k].id ?? "—"}  ${fx[k].phone ?? ""}`);
}
console.log(`  plan    ${fx.planCode}`);

// A screen is shot as whoever owns its fixture; `noSlot` is a seller with no
// remaining listing quota, which is what puts the plan wall on screen.
const ACTORS = {
  owner: fx.live.phone,
  draftOwner: fx.draft.phone,
  projectOwner: fx.proj.phone,
  requirementOwner: fx.req.phone,
  soldOwner: fx.sold.phone,
  reviewOwner: fx.review.phone,
  builder: "+919999000014",
  // An OWNER-role account. The plan wall highlights a different plan per role
  // (owner → p999), and the design shows the owner's view.
  ownerRole: "+919999000004",
};
const sessions = {};
for (const [label, phone] of Object.entries(ACTORS)) {
  if (!phone) continue;
  if (Object.values(sessions).some((s) => s.user.phone === phone)) {
    sessions[label] = Object.values(sessions).find((s) => s.user.phone === phone);
    continue;
  }
  try { sessions[label] = await login(phone); }
  catch (e) { console.log(`  ! login ${label} (${phone}): ${e.message}`); }
}

// `next dev` compiles a route on its first request; without a warm-up pass the
// first screenshot of each screen is whatever renders during that compile.
const specs = screenMap(fx).filter((s) => (!only.length || only.some((f) => s.id.includes(f))) && s.url);
// Two passes: the first triggers the compile, the second waits for it to be
// genuinely served. One pass leaves the browser racing a still-compiling route
// and screenshotting its skeleton.
const urls = [...new Set(specs.map((s) => s.url))];
for (let pass = 0; pass < 2; pass++) {
  await Promise.all(urls.map((u) => fetch(u, { redirect: "manual" }).catch(() => {})));
}
console.log(`warmed ${urls.length} routes`);

const chrome = await launchChrome();
const designSess = await Session.connect(chrome.wsUrl);
await designSess.setViewport(VW, VH);

const report = [];
for (const spec of screenMap(fx)) {
  if (only.length && !only.some((f) => spec.id.includes(f))) continue;
  if (!spec.url) { report.push({ id: spec.id, status: "NO FIXTURE" }); console.log(`- ${spec.id}: NO FIXTURE`); continue; }

  let designPng, appPng, err = null, consoleErrors = [], settled = true, landed = null, redirected = false;
  try { designPng = await captureDesign(designSess, spec); }
  catch (e) { err = `design: ${e.message}`; }

  const appSess = await Session.connect(chrome.wsUrl);
  await appSess.setViewport(VW, VH);
  try {
    const s = sessions[spec.as];
    const r = await captureApp(appSess, spec.url, {
      ...spec,
      cookies: s ? [...cookiesFor(s.jar, "seller.localhost"), ...cookiesFor(s.jar, "localhost")] : null,
    });
    appPng = r.png;
    settled = r.settled;
    landed = r.landed;
    redirected = r.redirected;
    consoleErrors = [...new Set(appSess.consoleErrors)].slice(0, 4);
  } catch (e) { err = (err ? err + " | " : "") + `app: ${e.message}`; }
  await appSess.close();

  if (!designPng || !appPng) {
    report.push({ id: spec.id, status: "ERROR", error: err });
    console.log(`- ${spec.id}: ERROR ${err}`);
    continue;
  }

  fs.writeFileSync(path.join(OUT, `${spec.id}.design.png`), designPng);
  fs.writeFileSync(path.join(OUT, `${spec.id}.app.png`), appPng);
  const d = await diff(designPng, appPng);
  fs.writeFileSync(path.join(OUT, `${spec.id}.diff.png`), d.diffPng);
  await contactSheet(designPng, appPng, d.diffPng, path.join(OUT, `${spec.id}.sheet.png`));

  const pct = (d.ratio * 100).toFixed(2);
  report.push({ id: spec.id, url: spec.url, diffPct: +pct, settled, redirected, landed, consoleErrors });
  console.log(`- ${spec.id}: ${pct}% differing${settled ? "" : "  [STILL LOADING]"}${redirected ? `  [REDIRECTED → ${landed}]` : ""}${consoleErrors.length ? `  [console: ${consoleErrors.length}]` : ""}`);
}

// Merge into any existing report so a filtered run updates rows instead of
// replacing the whole table.
const reportPath = path.join(OUT, "report.json");
let merged = report;
if (only.length && fs.existsSync(reportPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const byId = new Map(prev.map((r) => [r.id, r]));
    for (const r of report) byId.set(r.id, r);
    merged = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  } catch { /* keep the fresh rows */ }
}
fs.writeFileSync(reportPath, JSON.stringify(merged, null, 2));
await designSess.close();
chrome.proc.kill();
await sql.end();
console.log(`\nwrote ${OUT}/report.json`);

/**
 * Capture what the app LOOKS LIKE and what it ANSWERS, so a framework upgrade
 * can be proven to have changed neither.
 *
 * This deliberately does NOT compare against designs/. The design files are
 * Rajan's and they move; the baseline for an upgrade is the app as it is built
 * right now. So: run this against the old Next, run it again against the new
 * one, and diff the two captures.
 *
 *   BASE=http://localhost:3001 OUT=_upgrade/base14 node scripts/upgrade-capture.mjs
 *   BASE=http://localhost:3000 OUT=_upgrade/next15 node scripts/upgrade-capture.mjs
 *
 * Both runs read the SAME fixtures file (_upgrade/fixtures.json), written by
 * the first run, so both visit byte-identical URLs. Without that the two runs
 * would pick different listings and every screenshot would differ for reasons
 * that have nothing to do with the upgrade.
 */
import fs from "node:fs";
import path from "node:path";
import { launchChrome, Session, sleep } from "./lib/cdp.mjs";
import { connect } from "./lib/dbx.mjs";
import { makeClient } from "./lib/session.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "_upgrade/capture";
const FIXTURES = process.env.FIXTURES ?? "_upgrade/fixtures.json";
const PORT = new URL(BASE).port;
const HOST = {
  public: `http://localhost:${PORT}`,
  seller: `http://seller.localhost:${PORT}`,
  admin: `http://account.localhost:${PORT}`,
};

const BANDS = { mobile: [390, 844], desktop: [1440, 900] };

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(FIXTURES), { recursive: true });

// ------------------------------------------------------------- fixtures ---
// Resolved once, from the database, then frozen to disk. Every later run
// replays exactly these ids.
async function resolveFixtures() {
  if (fs.existsSync(FIXTURES)) {
    console.log(`fixtures: reusing ${FIXTURES}`);
    return JSON.parse(fs.readFileSync(FIXTURES, "utf8"));
  }
  const db = await connect();
  const one = async (q, ...a) => (await db.query(q, a)).rows[0] ?? null;

  // OTP sends are capped at 10/day per actor (lib/auth/otp.ts SMS_PER_DAY_IP;
  // scripts/lib/session.mjs gives each phone its own synthetic IP). Anyone
  // already in the QA session cache has spent some of that budget, and an actor
  // who hits the cap logs in nowhere — the middleware then bounces every
  // authenticated screen to /login and the capture silently tests nothing.
  // Prefer actors that have not been used yet.
  let burnt = [];
  try { burnt = Object.keys(JSON.parse(fs.readFileSync(".qa-sessions.json", "utf8"))); } catch {}
  if (burnt.length) console.log(`fixtures: avoiding ${burnt.length} actor(s) with spent OTP budget`);

  // The listing's OWN owner, not just any owner: the seller-host view of a
  // listing is the owner's view, and signing in as somebody else leaves it on a
  // skeleton that captures nothing.
  const listing = await one(
    `select l.id, p.username, p.phone as owner_phone from listings l join profiles p on p.id=l.profile_id
      where l.status='live' and p.state='active' and p.is_registered and not (p.phone = any($1))
      order by l.id limit 1`, burnt)
    ?? await one(
    `select l.id, p.username, p.phone as owner_phone from listings l join profiles p on p.id=l.profile_id
      where l.status='live' and p.state='active' and p.is_registered order by l.id limit 1`);
  const project = await one(`select id from projects where status='live' order by id limit 1`);
  const requirement = await one(`select id from requirements where status='live' order by id limit 1`);
  // Area pages are served off `locations` (there is no `areas` table), and the
  // route is /area/{areaSlug}-{citySlug} — see buildPath() in lib/seo/slugs.ts.
  // A bare area slug 404s, which would have quietly captured the not-found page
  // on both sides and called it a match.
  const area = await one(
    `select a.slug || '-' || c.slug as slug
       from locations a join locations c on c.id = a.parent_id
      where a.level='area' and a.is_launched and a.slug is not null
        and c.level='city' and c.slug is not null
      order by a.slug limit 1`);
  const blog = await one(`select slug from blog_posts where status='published' order by slug limit 1`);
  // Stable actors: lowest phone per role, so both runs log in as the same people.
  const actor = async (role) => (
    (await one(
      `select phone from profiles where role=$1 and state='active' and is_registered
          and name is not null and city_id is not null and not (phone = any($2))
        order by phone limit 1`, role, burnt))
    ?? await one(
      `select phone from profiles where role=$1 and state='active' and is_registered
          and name is not null and city_id is not null order by phone limit 1`, role)
  )?.phone ?? null;

  const f = {
    listingId: listing?.id ?? null,
    username: listing?.username ?? null,
    listingOwner: listing?.owner_phone ?? null,
    projectId: project?.id ?? null,
    requirementId: requirement?.id ?? null,
    areaSlug: area?.slug ?? null,
    blogSlug: blog?.slug ?? null,
    owner: await actor("owner"),
    broker: await actor("broker"),
    builder: await actor("builder"),
  };
  await db.end();
  fs.writeFileSync(FIXTURES, JSON.stringify(f, null, 2));
  console.log(`fixtures: wrote ${FIXTURES}`);
  return f;
}

// --------------------------------------------------------------- screens ---
function screensFor(f) {
  const S = [];
  const add = (id, host, url, band = "mobile", as = null) =>
    S.push({ id, url: HOST[host] + url, band, as });

  // ---- public (guest)
  add("pub-feed", "public", "/");
  add("pub-feed-desktop", "public", "/", "desktop");
  add("pub-search", "public", "/search");
  add("pub-legal-index", "public", "/legal");
  add("pub-legal-privacy", "public", "/legal/privacy");
  add("pub-legal-terms", "public", "/legal/terms");
  add("pub-blog", "public", "/blog");
  if (f.blogSlug) add("pub-blog-post", "public", `/blog/${f.blogSlug}`);
  if (f.areaSlug) add("pub-area", "public", `/area/${f.areaSlug}`);
  if (f.listingId) add("pub-property", "public", `/property/${f.listingId}`);
  if (f.listingId) add("pub-property-desktop", "public", `/property/${f.listingId}`, "desktop");
  if (f.username) add("pub-profile", "public", `/profile/${f.username}`);
  if (f.projectId) add("pub-project", "public", `/project/${f.projectId}`);
  if (f.requirementId) add("pub-requirement", "public", `/requirements/${f.requirementId}`);
  add("pub-login", "public", "/login");
  add("pub-404", "public", "/definitely-not-a-real-route");

  // ---- seller (logged in)
  for (const [role, phone] of [["owner", f.owner], ["builder", f.builder]]) {
    if (!phone) continue;
    add(`sel-${role}-home`, "seller", "/", "mobile", phone);
    add(`sel-${role}-listings`, "seller", "/listings", "mobile", phone);
    add(`sel-${role}-messages`, "seller", "/messages", "mobile", phone);
    add(`sel-${role}-notifications`, "seller", "/notifications", "mobile", phone);
    add(`sel-${role}-saved`, "seller", "/saved", "mobile", phone);
    add(`sel-${role}-plans`, "seller", "/plans", "mobile", phone);
    add(`sel-${role}-profile`, "seller", "/profile", "mobile", phone);
    add(`sel-${role}-settings`, "seller", "/settings", "mobile", phone);
    add(`sel-${role}-leads`, "seller", "/leads", "mobile", phone);
    add(`sel-${role}-visits`, "seller", "/visits", "mobile", phone);
    add(`sel-${role}-requirements`, "seller", "/requirements", "mobile", phone);
    add(`sel-${role}-create`, "seller", "/create", "mobile", phone);
    add(`sel-${role}-home-desktop`, "seller", "/", "desktop", phone);
  }
  // /seller/projects has no index route — only [id] and new — so the bare path
  // is a legitimate 404 and captures nothing.
  if (f.builder) add("sel-builder-project-new", "seller", "/projects/new", "mobile", f.builder);

  // The DETAIL screens are gated: /api/v1/listings/:id/card is 401 to a guest,
  // so the public property/project pages sit on a skeleton forever. That is the
  // real guest behaviour and is captured above — but it tests almost nothing,
  // so capture the loaded versions here, signed in, where the page has content.
  if (f.listingOwner && f.listingId) {
    add("sel-property-detail", "seller", `/property/${f.listingId}`, "mobile", f.listingOwner);
    add("sel-property-detail-desktop", "seller", `/property/${f.listingId}`, "desktop", f.listingOwner);
    add("sel-owner-own-listings", "seller", "/listings", "mobile", f.listingOwner);
  }
  if (f.builder && f.projectId) add("sel-project-detail", "seller", `/projects/${f.projectId}`, "mobile", f.builder);
  if (f.listingOwner && f.username) add("sel-profile-detail", "seller", `/profile/${f.username}`, "mobile", f.listingOwner);
  if (f.owner && f.requirementId) add("sel-requirement-detail", "seller", `/requirements/${f.requirementId}`, "mobile", f.owner);

  return S;
}

// ------------------------------------------------------------- API probes ---
// The screenshots prove the pixels; these prove the payloads behind them.
const API = [
  ["GET", "/api/v1/auth/me"],
  ["GET", "/api/v1/feed?mode=property"],
  ["GET", "/api/v1/feed?mode=requirement"],
  ["GET", "/api/v1/listings/mine"],
  ["GET", "/api/v1/chat/threads?tab=all"],
  ["GET", "/api/v1/notifications"],
  ["GET", "/api/v1/saved"],
  ["GET", "/api/v1/leads"],
  ["GET", "/api/v1/visits"],
  ["GET", "/api/v1/billing/plans"],
  ["GET", "/api/v1/profile/me"],
  ["GET", "/api/v1/requirements/mine"],
  ["GET", "/api/v1/system/maintenance"],
  ["GET", "/api/v1/cms/pages/privacy"],
  ["GET", "/api/v1/cms/pages/terms"],
  ["GET", "/api/v1/blog"],
];

/**
 * Values that legitimately move between two runs a few minutes apart. Blanking
 * them is the difference between a diff that means something and a diff that
 * is all noise.
 */
function normalise(v) {
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (/^(.*At|.*_at|timestamp|now|expires.*|.*Ago|lastSeen.*|updatedAt)$/i.test(k)) { out[k] = "<time>"; continue; }
      if (/^(token|csrf|nonce|sid|requestId|traceId)$/i.test(k)) { out[k] = "<opaque>"; continue; }
      out[k] = normalise(val);
    }
    return out;
  }
  if (typeof v === "string") {
    return v
      .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<time>")
      // Relative labels move purely because wall-clock time passed between the
      // two captures: "2h ago" -> "3h ago", and eventually "6d ago" -> "28 Jul".
      // Both forms have to go or every notifications payload diffs for nothing.
      .replace(/\b\d+\s?(s|m|h|d|w|mo|y|second|minute|hour|day|week|month|year)s?\s+ago\b/gi, "<ago>")
      .replace(/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, "<date>")
      .replace(/\bjust now\b/gi, "<ago>");
  }
  return v;
}

// ------------------------------------------------------------------ run ---
const f = await resolveFixtures();
// ONLY=a,b,c narrows the run — used to re-shoot just the screens that differed,
// and to run the same server against itself as a control.
const only = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const screens = screensFor(f).filter((s) => !only.length || only.includes(s.id));
const { session: login } = makeClient(HOST.public);

// One login per actor, reused for both the API probes and the browser cookies.
const jars = {};
for (const phone of new Set(screens.map((s) => s.as).filter(Boolean))) {
  try {
    const s = await login(phone);
    jars[phone] = s;
    console.log(`login ok: ${phone} (${s.user.role})`);
  } catch (e) {
    console.log(`login FAILED: ${phone} — ${e.message}`);
  }
}

// ---- API capture
const apiOut = {};
for (const [actorLabel, jar] of [["guest", null], ...Object.entries(jars)]) {
  for (const [method, p] of API) {
    const cookie = jar ? [...jar.jar].map(([k, v]) => `${k}=${v}`).join("; ") : "";
    let status = 0, body = null;
    try {
      const res = await fetch(HOST.public + p, { method, headers: cookie ? { cookie } : {}, redirect: "manual" });
      status = res.status;
      try { body = await res.json(); } catch { body = null; }
    } catch (e) { body = { __fetchError: e.message }; }
    apiOut[`${actorLabel} ${method} ${p}`] = { status, body: normalise(body) };
  }
}
fs.writeFileSync(path.join(OUT, "api.json"), JSON.stringify(apiOut, null, 2));
console.log(`api: ${Object.keys(apiOut).length} probes -> ${OUT}/api.json`);

// ---- screenshot capture
const chrome = await launchChrome({ port: Number(process.env.CDP_PORT ?? 9333) });
const shots = {};
const shotWait = {};

const applyCookies = async (sess, s) => {
  const host = new URL(s.url).hostname;
  await sess.setCookies([...jars[s.as].jar].map(([name, value]) => ({
    name, value, domain: host, path: "/", httpOnly: true, secure: false,
  })));
};

/**
 * Refresh a session ONLY when a screen actually bounced.
 *
 * An earlier version re-validated before every single screen. session() falls
 * back to a full OTP sign-in when its cached jar is stale, so 49 screens over
 * several runs burned the daily OTP allowance and every authenticated screen
 * came back RATE_LIMITED and bounced to /login — on both sides, so the diff
 * looked clean while testing nothing. One rotation per actor, on demand.
 */
const rotate = async (phone) => {
  try {
    await jars[phone].call("/api/v1/auth/refresh", { method: "POST", body: "{}" });
    const me = await jars[phone].call("/api/v1/auth/me");
    return !!me.json?.data?.user;
  } catch { return false; }
};

/**
 * Keep an actor's cookies alive without ever spending an OTP.
 *
 * The access cookie is short-lived and this capture takes minutes, so tokens
 * die partway through and the middleware starts bouncing screens to /login.
 * Check cheaply (`/auth/me`) and rotate with the refresh cookie only when the
 * check actually fails — never fall through to a fresh sign-in, which is what
 * exhausted the 10/day OTP budget last time.
 */
const ensureLive = async (phone) => {
  try {
    const me = await jars[phone].call("/api/v1/auth/me");
    if (me.json?.data?.user) return true;
  } catch {}
  return rotate(phone);
};
for (const s of screens) {
  const sess = await Session.connect(chrome.wsUrl);
  try {
    const [w, h] = BANDS[s.band];
    await sess.setViewport(w, h, 1, s.band === "mobile");
    if (s.as && jars[s.as]) {
      await ensureLive(s.as);
      await applyCookies(sess, s);
    }
    await sess.goto(s.url, { waitMs: 800 });

    // Wait for the screen to SETTLE, not for a fixed delay. These screens fetch
    // after hydration, so a flat delay caught several of them mid-skeleton —
    // and a skeleton is timing-dependent, which would produce pixel diffs on
    // the next run that have nothing to do with the upgrade.
    //
    // Settling on "the text stopped changing" is not enough on its own: a
    // skeleton is static too, so a screen still loading looks exactly as
    // settled as one that finished. Wait for the loading placeholders to go as
    // well, and only give up on them after a cap — some screens (a guest on a
    // gated detail page) legitimately never leave the skeleton, and that IS
    // their current behaviour, so it should still be captured.
    // "The text stopped changing" is NOT enough, and the earlier version of
    // this loop proved it: it bailed after 0.75s of no change, which is exactly
    // what a page looks like while it waits on its first fetch. The screen
    // sitting at 85 characters for three samples got captured as "settled",
    // then matched the other capture's identical pre-load state and reported
    // 0.000% — a green diff over a screen neither side had rendered.
    //
    // Two guards fix it: never accept stability before MIN_WAIT (this app's
    // slowest desktop screen finishes around 5s in dev), and require a much
    // longer quiet period. The skeleton selector is kept as a hint only — this
    // app's placeholders do not use .animate-pulse, so it cannot be trusted as
    // the readiness signal.
    const STEP = 250, MIN_WAIT_MS = 7000, QUIET = 12, CAP_MS = 30000;
    let last = -1, stable = 0, skeletons = -1, waited = 0;
    while (waited < CAP_MS) {
      const m = await sess.eval(`(() => ({
        len: document.body.innerText.length + document.querySelectorAll('img,svg').length,
        sk: document.querySelectorAll('.animate-pulse,[aria-busy="true"],[data-skeleton]').length,
      }))()`).catch(() => null);
      if (!m) break;
      stable = m.len === last ? stable + 1 : 0;
      last = m.len; skeletons = m.sk;
      if (waited >= MIN_WAIT_MS && stable >= QUIET && m.sk === 0) break;
      await sleep(STEP); waited += STEP;
    }
    shotWait[s.id] = waited;
    if (skeletons > 0) console.log(`       (${s.id}: still showing ${skeletons} loading placeholder(s))`);

    // Kill anything that animates, ticks, or appears on its own schedule, so
    // two captures of the same screen are actually identical.
    //
    // Two things here are NOT part of the app and were producing a constant
    // false diff on every single screen:
    //   · Next's own dev indicator — it is drawn differently by 14 and 15 and
    //     does not exist in a production build at all. It alone accounted for
    //     ~0.35% on every screen.
    //   · The PWA install card, which only shows when Chrome decides to fire
    //     `beforeinstallprompt`. Each run gets a fresh browser profile, so it
    //     appeared in one capture and not the other, worth another ~2.2%.
    await sess.eval(`
      document.querySelectorAll(
        'nextjs-portal, #__next-build-watcher, [data-nextjs-toast], #__next-prerender-indicator, [data-nextjs-dev-tools-button]'
      ).forEach(el => el.style.setProperty('display', 'none', 'important'));
      document.querySelectorAll('div.fixed').forEach(el => {
        if (/Install HomzList/i.test(el.textContent || '')) el.style.setProperty('display', 'none', 'important');
      });
      document.querySelectorAll('*').forEach(el => {
        el.style.animationPlayState = 'paused';
        el.style.transitionDuration = '0s';
        el.style.caretColor = 'transparent';
      });
      window.scrollTo(0, 0);
      true;
    `).catch(() => {});
    await sleep(400);
    let png = await sess.screenshot({ fullPage: true });
    // A full disk does not throw here — it produces a truncated or empty file,
    // and the comparison later reads that as "the screen changed". It cost a
    // whole capture run once; fail on the spot instead.
    if (!png || png.length < 512) throw new Error(`screenshot came back ${png?.length ?? 0} bytes — out of disk?`);
    const outFile = path.join(OUT, `${s.id}.png`);
    fs.writeFileSync(outFile, png);
    const written = fs.statSync(outFile).size;
    if (written !== png.length) throw new Error(`wrote ${written} of ${png.length} bytes — out of disk?`);
    let finalUrl = await sess.eval("location.pathname + location.search").catch(() => "?");
    // Bounced? Rotate this actor's tokens once and re-shoot, rather than
    // recording the login page as if it were the screen.
    if (s.as && /^\/login\b/.test(finalUrl) && (await rotate(s.as))) {
      await applyCookies(sess, s);
      await sess.goto(s.url, { waitMs: 2000 });
      await sleep(8000);
      finalUrl = await sess.eval("location.pathname + location.search").catch(() => "?");
      const png2 = await sess.screenshot({ fullPage: true });
      if (png2 && png2.length >= 512) { png = png2; fs.writeFileSync(outFile, png2); }
    }
    const title = await sess.eval("document.title").catch(() => "?");
    const bodyLen = await sess.eval("document.body.innerText.length").catch(() => -1);
    shots[s.id] = {
      url: s.url, band: s.band, as: s.as ?? "guest",
      finalPath: finalUrl, title, bodyLen,
      consoleErrors: sess.consoleErrors.slice(0, 10),
      failedRequests: sess.failedRequests.slice(0, 10),
      bytes: png.length,
      settleMs: shotWait[s.id] ?? null,
      skeletons,
    };
    console.log(`  shot ${s.id.padEnd(28)} ${String(png.length).padStart(8)}b  ${finalUrl}`);
  } catch (e) {
    shots[s.id] = { url: s.url, error: e.message };
    console.log(`  shot ${s.id.padEnd(28)} FAILED ${e.message}`);
  } finally {
    await sess.close().catch(() => {});
  }
}
fs.writeFileSync(path.join(OUT, "screens.json"), JSON.stringify(shots, null, 2));
chrome.proc.kill();

// A capture that silently fell out of session is worse than no capture: every
// bounced screen is the same /login page on both sides, so the comparison comes
// back clean having tested nothing. Fail loudly instead.
const bounced = Object.entries(shots).filter(([, v]) => v.as !== "guest" && /^\/login\b/.test(v.finalPath ?? ""));
const errored = Object.entries(shots).filter(([, v]) => v.error);
// A screen captured before its content arrived matches the other capture's
// equally-empty screen and reports 0.000% — the most dangerous result this
// harness can produce, because it looks like proof. Surface them.
const hollow = Object.entries(shots).filter(([, v]) => !v.error && (v.bodyLen ?? 0) < 120);
console.log(`\ncaptured ${Object.keys(shots).length} screens + ${Object.keys(apiOut).length} api probes -> ${OUT}`);
if (errored.length) console.log(`  ${errored.length} screen(s) FAILED: ${errored.map(([k]) => k).join(", ")}`);
if (bounced.length) {
  console.log(`  ${bounced.length} authenticated screen(s) landed on /login — the session died mid-run:`);
  for (const [k] of bounced) console.log(`    - ${k}`);
}
if (hollow.length) {
  console.log(`  ${hollow.length} screen(s) have almost no rendered text — check they are not pre-load states:`);
  for (const [k, v] of hollow) console.log(`    - ${k.padEnd(28)} text=${v.bodyLen} settle=${v.settleMs}ms png=${v.bytes}b`);
}
process.exit(bounced.length || errored.length ? 1 : 0);

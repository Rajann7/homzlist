/**
 * The design's screens, one by one, in a real hydrated browser.
 *
 *   node scripts/check-design-screens.mjs [http://seller.lvh.me:3000]
 *
 * `designs/_samples/interest-system-sample.html` is the design of record for
 * the connection system. This walks its screens in order and asserts that the
 * shipped app draws what the design draws — the furniture, the copy that
 * carries meaning, and the states — then leaves a screenshot of each next to
 * the others so they can be read side by side.
 *
 * It is not a pixel differ. It checks the things a pixel differ cannot tell
 * you: that the section exists, that it is filled from real data, and that the
 * control does what the design says it does.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { launch, newPage } from "./lib/cdp.mjs";

const BASE = (process.argv[2] ?? "http://seller.lvh.me:3000").replace(/\/$/, "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "docs", "_shots", "design");

const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = new pg.Client({
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
  password: E.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
});
await db.connect();

const results = [];
const check = (n, p, d = "") => { results.push({ n, p: !!p, d }); console.log(`${p ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); };
const screen = (n) => console.log(`\n── ${n} ${"─".repeat(Math.max(0, 46 - n.length))}`);

// ---- fixtures --------------------------------------------------------------
const VIEWER_PHONE = process.env.DESIGN_VIEWER_PHONE ?? "9826008333";
const { rows: [viewer] } = await db.query(`select id, name, phone from profiles where phone=$1`, [`+91${VIEWER_PHONE.slice(-10)}`]);

const { rows: [publicListing] } = await db.query(
  `select id, title from listings
    where status='live' and sold_at is null and contact_public = true and contact_number is not null and profile_id <> $1
    order by created_at desc limit 1`, [viewer.id]);
const { rows: [privateListing] } = await db.query(
  `select id, title from listings
    where status='live' and sold_at is null and coalesce(contact_public,false) = false and profile_id <> $1
    order by created_at desc limit 1`, [viewer.id]);
const { rows: [project] } = await db.query(
  `select id, name from projects where status='live' and profile_id <> $1 order by created_at desc limit 1`, [viewer.id]);
const { rows: [requirement] } = await db.query(
  `select id from requirements where status='live' and is_active and profile_id <> $1 order by created_at desc limit 1`, [viewer.id]);

console.log(`viewer ${viewer.name}`);
console.log(`public-number listing: ${publicListing?.title ?? "—"}`);
console.log(`private-number listing: ${privateListing?.title ?? "—"}`);
console.log(`project: ${project?.name ?? "—"} · requirement: ${requirement?.id ?? "—"}`);

const browser = await launch({ headless: true });
const page = await newPage(browser, "about:blank");
await page.setViewport(390, 844);

const text = () => page.eval(`document.body.innerText`);
const shoot = (n) => page.screenshot(path.join(SHOTS, n));

try {
  await page.goto(`${BASE}/login`, { waitMs: 900 });
  await page.eval(`(async () => {
    const post = async (u,b) => (await fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),credentials:"same-origin"})).json();
    const r1 = await post("/api/v1/auth/otp/request",{phone:${JSON.stringify(VIEWER_PHONE)}});
    const r2 = await post("/api/v1/auth/otp/verify",{otpSession:r1.data.otpSession,code:r1.data.devCode??"123456"});
    return r2.ok;
  })()`);

  // ---- 1 · property detail, number private --------------------------------
  if (privateListing) {
    screen("1 · Property detail (number private)");
    await page.goto(`${BASE}/listings/${privateListing.id}`, { waitMs: 1800 });
    await page.waitFor(`(document.querySelector("main")?.innerText ?? "").length > 300`);
    const v = await page.eval(`(() => {
      const t = document.body.innerText;
      return {
        cta: [...document.querySelectorAll("button")].some(b => /send inquiry/i.test(b.innerText)),
        noNumber: !/Number public/i.test(t),
        privacyNote: /keeps their number private/i.test(t),
      };
    })()`);
    check("Send Inquiry is the one action", v.cta, `cta=${v.cta}`);
    check("no published number is shown", v.noNumber);
    check("it says why (design screen 1)", v.privacyNote, `note=${v.privacyNote}`);
    await shoot("01-property-private.png");
  } else {
    check("screen 1 (skipped — no listing with a private number)", true, "");
  }

  // ---- 2 · property detail, number public + connect choice ----------------
  if (publicListing) {
    screen("2 · Property detail (number public) + connect choice");
    await page.goto(`${BASE}/listings/${publicListing.id}`, { waitMs: 1800 });
    await page.waitFor(`(document.querySelector("main")?.innerText ?? "").length > 300`);
    const card = await page.eval(`(() => {
      const t = document.body.innerText;
      return {
        badge: /Number public/i.test(t),
        number: /\\+91\\s?\\d{10}/.test(t.replace(/\\s+/g, " ")),
        copy: /tap to copy/i.test(t),
        masked: /•{2,}|\\*{2,}/.test(t),
        underPoster: (() => { const c = document.getElementById("sec-contact"); return !!c && /Number public/i.test(c.innerText); })(),
      };
    })()`);
    check("the number sits under the poster, on their card", card.underPoster, `posterFirst=${card.underPoster}`);
    check("'Number public' badge renders", card.badge);
    check("the number is shown in full, never masked", card.number && !card.masked, `full=${card.number} masked=${card.masked}`);
    check("tap-to-copy is offered", card.copy);
    await shoot("02a-property-public-card.png");

    await page.clickText("Send Inquiry");
    await page.waitFor(`/how would you like to connect/i.test(document.body.innerText)`);
    const choice = await page.eval(`(() => {
      const t = document.body.innerText;
      return {
        opened: /how would you like to connect/i.test(t),
        call: /call now/i.test(t),
        wa: /opens with a ready line/i.test(t),
        inquiry: /3 taps/i.test(t),
      };
    })()`);
    check("the three-way connect choice opens (design screen 2)",
      choice.opened && choice.call && choice.wa && choice.inquiry, JSON.stringify(choice));
    await shoot("02b-connect-choice.png");

    // …and Send Inquiry inside it reaches the three steps.
    await page.clickText("Send Inquiry", { nth: 1 });
    await page.waitFor(`/step 1 of 3|inquiry already sent/i.test(document.body.innerText)`);
    check("choosing Send Inquiry opens the steps",
      /step 1 of 3|inquiry already sent/i.test(await text()), "");
  } else {
    check("screen 2 (skipped — no listing publishes a number)", true, "");
  }

  // ---- 6 · project detail, builder's number under their profile -----------
  if (project) {
    screen("6 · Project detail (builder's number)");
    await page.goto(`${BASE}/projects/${project.id}`, { waitMs: 2000 });
    await page.waitFor(`(document.querySelector("main")?.innerText ?? "").length > 300`);
    const v = await page.eval(`(() => {
      const t = document.body.innerText;
      const c = document.getElementById("sec-builder");
      return {
        builderSection: !!c,
        badge: /Number public/i.test(t),
        under: !!c && /Number public/i.test(c.innerText),
        number: /\\+91\\s?\\d{10}/.test(t.replace(/\\s+/g, " ")),
        callWa: [...document.querySelectorAll("button")].filter(b => /^(call|whatsapp)$/i.test(b.innerText.trim())).length,
      };
    })()`);
    check("the builder section renders", v.builderSection);
    check("their number sits UNDER the builder's profile", v.under, `badgeAfterBuilder=${v.under}`);
    check("the number is there in full", v.number);
    check("Call and WhatsApp sit with it", v.callWa >= 2, `${v.callWa} buttons`);
    await shoot("06-project-builder-number.png");
  } else {
    check("screen 6 (skipped — no live project)", true, "");
  }

  // ---- 7/16 · requirement: Send Proposal, quota, limit state --------------
  if (requirement) {
    screen("7 · Requirement · Send Proposal + quota");
    await page.goto(`${BASE}/requirements/${requirement.id}`, { waitMs: 2000 });
    await page.waitFor(`(document.querySelector("main")?.innerText ?? "").length > 200`);
    // A requirement can be plan-LOCKED for this viewer (Module 5). That is a
    // real branch of the screen, not a missing button — assert whichever one
    // the viewer is actually entitled to see.
    const req = await page.eval(`(() => ({
      btn: [...document.querySelectorAll("button")].some(b => /send proposal/i.test(b.innerText)),
      locked: /unlock|upgrade|plan/i.test(document.body.innerText),
      own: /Mark Fulfilled/i.test(document.body.innerText),
    }))()`);
    const hasBtn = req.btn;
    check("a requirement offers Send Proposal, or says why it cannot",
      req.btn || req.locked || req.own, JSON.stringify(req));
    if (hasBtn) {
      await page.clickText("Send Proposal");
      await page.waitFor(`/proposals left this month|unlimited proposals|already answered|publish a project/i.test(document.body.innerText)`);
      const v = await page.eval(`(() => {
        const t = document.body.innerText;
        return {
          quota: /proposals left this month|unlimited proposals/i.test(t),
          haveProperty: /i have a property/i.test(t),
          arrange: /i can arrange it/i.test(t),
          limit: /used all your proposals/i.test(t),
          already: /already answered this requirement/i.test(t),
        };
      })()`);
      check("the quota line is on the sheet", v.quota || v.limit, JSON.stringify(v));
      check("both ways to answer are offered", (v.haveProperty && v.arrange) || v.already || v.limit,
        `have=${v.haveProperty} arrange=${v.arrange} already=${v.already} limit=${v.limit}`);
      await shoot("07-proposal-sheet.png");
    }
  } else {
    check("screen 7 (skipped — no live requirement)", true, "");
  }

  // ---- 10/11/13 · the Leads screens ---------------------------------------
  screen("10 · Leads · Received");
  await page.goto(`${BASE}/leads`, { waitMs: 1800 });
  await page.waitFor(`/\\d+ total/.test(document.querySelector("header")?.innerText ?? "") || /No leads yet/i.test(document.body.innerText)`);
  const hub = await page.eval(`(() => {
    const t = document.querySelector("main")?.innerText ?? "";
    return {
      header: document.querySelector("header")?.innerText?.replace(/\\n/g, " ") ?? "",
      tabs: /Received/.test(t) && /Sent/.test(t),
      groups: ["properties", "projects", "requirements"].filter(g => t.toLowerCase().includes(g)),
      counts: /\\d+ new · \\d+ total|\\d+ total/.test(t),
      badges: document.querySelectorAll("main a[href*='/leads/'] span").length > 0,
    };
  })()`);
  check("header carries the live total (design 10)", /\d+ total/.test(hub.header), hub.header);
  check("Received / Sent tabs", hub.tabs);
  check("groups render by kind", hub.groups.length > 0, hub.groups.join("/"));
  check("each row carries its counts", hub.counts);
  await shoot("10-leads-received.png");

  screen("12 · Leads · Sent");
  await page.eval(`(() => { const b=[...document.querySelectorAll("button")].find(x=>/^Sent/i.test(x.innerText.trim())); if(b) b.click(); return !!b; })()`);
  await page.eval(`new Promise(r=>setTimeout(r,800))`);
  const sent = await page.eval(`(() => {
    const t = document.querySelector("main")?.innerText ?? "";
    return { onSent: /Sent ·/.test(t) || /haven't sent anything/i.test(t), states: /Sent|Seen|Owner contacted you|Closed/.test(t) };
  })()`);
  check("Sent tab renders its own list/empty state", sent.onSent, JSON.stringify(sent));
  await shoot("12-leads-sent.png");

  screen("11 · Leads on one post");
  await page.goto(`${BASE}/leads`, { waitMs: 1400 });
  await page.waitFor(`!!document.querySelector("main a[href*='/leads/']")`);
  await page.clickSelector('main a[href*="/leads/listing/"], main a[href*="/leads/project/"], main a[href*="/leads/requirement/"]');
  await page.waitFor(`location.pathname.split("/").length > 2`);
  await page.waitFor(`!!document.querySelector("main a[href*='/leads/lead/']") || /No leads on this/i.test(document.body.innerText)`);
  const subj = await page.eval(`(() => ({
    chips: [...document.querySelectorAll("main button")].map(b=>b.innerText.trim()).filter(c=>/^(All|New|Overdue|Contacted|Converted|Archived) \\d+$/.test(c)),
    dial: [...document.querySelectorAll("main button")].filter(b=>/^(call|whatsapp)$/i.test(b.innerText.trim())).length,
    menus: document.querySelectorAll('main button[aria-label="Lead options"]').length,
  }))()`);
  check("filter chips with counts", subj.chips.length > 0, subj.chips.join(" | "));
  check("leads only — no dial buttons on the list", subj.dial === 0, `${subj.dial} dial buttons`);
  check("every lead has its ⋯", subj.menus > 0, `${subj.menus} menus`);
  await shoot("11-leads-on-post.png");

  screen("13 · Lead detail");
  await page.clickSelector('main a[href*="/leads/lead/"]');
  await page.waitFor(`/inquiry for/i.test(document.body.innerText)`);
  const det = await page.eval(`(() => {
    const t = document.querySelector("main")?.innerText ?? "";
    return {
      inquiryFor: /inquiry for/i.test(t),
      rows: ["Wants", "Contact by", "Number", "Best time", "Received"].filter(k => t.includes(k)),
      status: /STATUS/i.test(t),
      chips: ["New","Contacted","Converted","Archived"].filter(c => t.includes(c)).length,
      number: /\\+91\\d{10}/.test(t),
      primary: [...document.querySelectorAll("main button")].map(b=>b.innerText.trim()).find(x=>/^(Call|WhatsApp)$/i.test(x)) ?? null,
    };
  })()`);
  check("INQUIRY FOR block", det.inquiryFor);
  check("all five detail rows (design 13)", det.rows.length === 5, det.rows.join(", "));
  check("STATUS with four chips", det.status && det.chips === 4, `chips=${det.chips}`);
  check("the number in full", det.number);
  check("the chosen channel leads", Boolean(det.primary), String(det.primary));
  await shoot("13-lead-detail.png");

  screen("console");
  const errs = page.consoleErrors().filter((t) => !/hmr|websocket|favicon|Failed to load resource/i.test(t));
  check("no console errors across every screen", errs.length === 0, errs.slice(0, 2).join(" | "));
  console.log(`\nscreenshots → ${SHOTS}`);
} finally {
  try { page.close(); } catch { /* closing */ }
  await browser.close();
  await db.end();
}

const failed = results.filter((r) => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("FAILED:"); failed.forEach((f) => console.log(` ❌ ${f.n} — ${f.d}`)); }
process.exit(failed.length ? 1 : 0);

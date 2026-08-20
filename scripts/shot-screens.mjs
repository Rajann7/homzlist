/**
 * Every screen of the LIVE app, as a mobile phone sees it, saved as a PNG.
 *
 *   node scripts/shot-screens.mjs                 # everything
 *   node scripts/shot-screens.mjs guest owner     # only those groups
 *   ONLY=login,feed node scripts/shot-screens.mjs # only ids containing these
 *
 * This is the reference set for building the tablet/desktop layouts: it is shot
 * from the running app against the real database, NOT from designs/, so what
 * lands in _screens/mobile is what the product actually renders today —
 * every route, for guest / owner / broker / builder, plus the sheets, dialogs,
 * menus, empty states and error states that only exist after an interaction.
 *
 * Two files per screen:
 *   <id>.png        — the 390x844 viewport, i.e. what fits on the phone
 *   <id>--full.png  — the whole scrollable screen, viewport grown to fit it
 * (the second is only written when the screen actually scrolls)
 *
 * Admin (account.*) is deliberately excluded — it already has all three device
 * layouts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, newPage } from "./lib/cdp.mjs";
import { connect } from "./lib/dbx.mjs";
import { makeClient } from "./lib/session.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "_screens", "mobile");
const PORT = process.env.PORT ?? "3000";
const HOST = {
  public: `http://localhost:${PORT}`,
  seller: `http://seller.localhost:${PORT}`,
};
const W = 390, H = 844;
const MAX_FULL = 12_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const wantGroups = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const resume = process.env.RESUME === "1";

/**
 * The dev server compiles ~100 routes over one run and has fallen over doing
 * it. Rather than lose the whole capture to that, wait for it to come back —
 * a restarted server picks up exactly where the run left off (RESUME=1).
 */
async function waitForServer({ tries = 60, gap = 5000 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${HOST.public}/api/v1/health`, { signal: AbortSignal.timeout(8000) })
        .catch(() => fetch(HOST.public, { signal: AbortSignal.timeout(8000) }));
      if (r) return true;
    } catch {}
    if (i === 0) console.log("  ⏳ dev server not answering — waiting for it to come back…");
    await sleep(gap);
  }
  throw new Error("dev server never came back");
}

// ─────────────────────────────────────────────────────────── actors ────────
const ACTORS = {
  owner: "+919999000004",   // Sneha Patel — 62 listings
  broker: "+919999000007",  // Amit Shah   — 62 listings
  builder: "+919999000014", // Manish Agarwal — 41 listings, 4 projects
};

// ─────────────────────────────────────────────────────────── fixtures ──────
async function fixtures() {
  const db = await connect();
  const one = async (sql, ...a) => (await db.query(sql, a)).rows[0] ?? null;
  const all = async (sql, ...a) => (await db.query(sql, a)).rows;

  const f = {};
  f.actors = {};
  for (const [role, phone] of Object.entries(ACTORS)) {
    f.actors[role] = await one(`select id, username, name, phone, role from profiles where phone=$1`, phone);
  }

  f.listingPublic = await one(
    `select id, title from listings where status='live' and sold_at is null
       and contact_public = true and contact_number is not null order by created_at desc limit 1`);
  f.listingPrivate = await one(
    `select id, title from listings where status='live' and sold_at is null
       and coalesce(contact_public,false)=false order by created_at desc limit 1`);
  f.listingSold = await one(`select id, title from listings where sold_at is not null limit 1`);
  f.project = await one(`select id, name from projects where status='live' order by created_at desc limit 1`);
  f.requirement = await one(`select id from requirements where status='live' and is_active order by created_at desc limit 1`);

  // per-role owned things, so "my listing" screens are really the actor's own
  for (const [role, p] of Object.entries(f.actors)) {
    if (!p) continue;
    // prefer a live one, but any listing is better than skipping the screen
    f[`${role}Listing`] = await one(
      `select id from listings where profile_id=$1
        order by (status='live') desc, created_at desc limit 1`, p.id);
    f[`${role}Project`] = await one(
      `select id from projects where profile_id=$1 order by created_at desc limit 1`, p.id);
    f[`${role}Lead`] = await one(
      `select id from leads where owner_id=$1 order by created_at desc limit 1`, p.id);
    f[`${role}Requirement`] = await one(
      `select id from requirements where profile_id=$1 order by created_at desc limit 1`, p.id);
    f[`${role}Ticket`] = await one(
      `select id from support_tickets where profile_id=$1 order by created_at desc limit 1`, p.id);
  }

  // A story is a poster's recently-live inventory (lib/feed/stories.ts), so the
  // viewer's :posterId is just the profile behind the newest live listing.
  f.storyPoster = await one(
    `select profile_id as poster_id from listings
      where status='live' and story_suppressed_at is null and live_at is not null
      order by live_at desc limit 1`);
  f.area = await one(`select slug from locations where level='area' and is_launched order by slug limit 1`);
  f.city = await one(`select slug, name from cities where is_active order by property_count desc nulls last limit 1`);
  f.blog = await one(`select slug from blog_posts where status='published' order by published_at desc nulls last limit 1`);
  f.legal = await one(`select slug from cms_pages where is_published order by sort_order limit 1`);
  f.helpCat = await one(`select slug from help_categories where is_active order by sort_order limit 1`);
  f.helpArticle = await one(`select slug from faqs where is_active and slug is not null order by sort_order limit 1`);
  f.profileUser = f.actors.broker?.username ?? null;

  // The role picker / details / coach screens exist for a FIRST-TIME number
  // only. Reusing one number would mean the second run of this script logs
  // straight in and silently photographs nothing, so find one nobody has used.
  f.newNumber = null;
  for (let n = 190; n < 260; n++) {
    const candidate = `900000${String(n).padStart(4, "0")}`;
    const taken = await one(`select 1 from profiles where phone=$1`, `+91${candidate}`);
    if (!taken) { f.newNumber = candidate; break; }
  }

  await db.end?.();
  return f;
}

// ───────────────────────────────────────────────────────────── login ───────
/**
 * Cookies come from the cached QA session jar (scripts/lib/session.mjs), not a
 * fresh OTP each run — OTP is capped at 3/hour per number and this script logs
 * in three actors on two hosts, which would burn the budget on the first run.
 */
async function cookiesFor(phone) {
  const client = makeClient(HOST.public);
  const s = await client.session(phone);
  return { jar: s.jar, user: s.user };
}

async function applyCookies(page, jar) {
  await page.send("Network.clearBrowserCookies");
  const cookies = [];
  for (const [name, value] of jar) {
    for (const domain of ["localhost", "seller.localhost"]) {
      cookies.push({ name, value, domain, path: "/", httpOnly: true, secure: false, sameSite: "Lax" });
    }
  }
  await page.send("Network.setCookies", { cookies });
}

// ──────────────────────────────────────────────────────────── capture ──────
/**
 * `next dev` paints its own floating badge and a "Compiling…" toast into a
 * <nextjs-portal> shadow host. Both sit on top of the app and would land in
 * every reference shot, so they are hidden — this touches nothing the app
 * itself renders.
 */
async function hideDevOverlay(page) {
  await page.eval(`(() => {
    if (!document.getElementById("__shot_hide_dev")) {
      const st = document.createElement("style");
      st.id = "__shot_hide_dev";
      st.textContent = "nextjs-portal,#__next-build-watcher,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}";
      document.head.appendChild(st);
    }
    return true;
  })()`);
}

let shotCount = 0;
// A resumed run must not lose what an earlier, interrupted run already recorded
// — the index is built from this file.
const manifest = (() => {
  try { return resume ? JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8")) : []; }
  catch { return []; }
})();

async function shoot(page, group, id, meta = {}) {
  const dir = path.join(OUT, group);
  fs.mkdirSync(dir, { recursive: true });

  await page.setViewport(W, H);
  await hideDevOverlay(page);
  await sleep(250);
  await page.screenshot(path.join(dir, `${id}.png`));

  // An overlay is pinned to the viewport, so growing the viewport does not
  // reveal more of it — it just floats the sheet over a very tall page behind.
  // Overlays get the phone-sized shot only.
  if (meta.overlay) {
    shotCount++;
    const i = manifest.findIndex((m) => m.group === group && m.id === id);
    const row = { group, id, full: false, height: H, ...meta };
    if (i >= 0) manifest[i] = row; else manifest.push(row);
    console.log(`  📸 ${group}/${id}`);
    return;
  }

  // The app shell is a fixed-height column with an inner scroller
  // (components/nav/AppShell.tsx), so a taller VIEWPORT — not a taller clip —
  // is what reveals the rest of the screen. Which element actually scrolls
  // differs per screen (main, the feed's own list, a chat thread), so measure
  // every scrollable element rather than guessing at one selector.
  const over = await page.eval(`(() => {
    let max = document.documentElement.scrollHeight - window.innerHeight;
    for (const el of document.querySelectorAll("*")) {
      const d = el.scrollHeight - el.clientHeight;
      if (d > max && el.clientHeight > 200 && getComputedStyle(el).overflowY !== "visible") max = d;
    }
    return max;
  })()`);

  let full = null;
  if (over > 24) {
    const h = Math.min(H + over + 8, MAX_FULL);
    await page.setViewport(W, h);
    await sleep(600);
    full = `${id}--full.png`;
    await page.screenshot(path.join(dir, full));
    await page.setViewport(W, H);
  }

  shotCount++;
  const at = manifest.findIndex((m) => m.group === group && m.id === id);
  const row = { group, id, full: !!full, height: over > 24 ? H + over : H, ...meta };
  if (at >= 0) manifest[at] = row; else manifest.push(row);
  console.log(`  📸 ${group}/${id}${full ? "  (+full " + (H + over) + "px)" : ""}`);
}

/** Navigate, wait for the screen to actually have content, then shoot. */
async function screen(page, group, id, url, { act, flow, waitMs = 1400, settle, noWait } = {}) {
  if (only.length && !only.some((o) => id.includes(o))) return;
  if (resume && !flow && fs.existsSync(path.join(OUT, group, `${id}.png`))) {
    console.log(`  ↺  ${group}/${id} — already captured`);
    return;
  }
  try {
    await waitForServer();
    if (flow) {
      // A multi-screen flow (auth, creation) drives itself and shoots as it goes.
      await flow(page, {
        goto: (u, o) => page.goto(u, o ?? { waitMs }),
        shoot: async (sid, meta) => { await hideDevOverlay(page); await shoot(page, group, sid, meta); },
        sleep,
        hideDevOverlay: () => hideDevOverlay(page),
      });
      return;
    }
    // `next dev` compiles a route on its first visit, and a cold compile can
    // outrun the CDP timeout. That is a slow route, not a broken one — so the
    // second attempt (against a now-warm route) is the one that counts.
    try {
      await page.goto(url, { waitMs });
    } catch (e) {
      if (!/timed out/i.test(e.message)) throw e;
      console.log(`  ⟳  ${group}/${id} — cold compile timed out, retrying`);
      await waitForServer();
      await page.goto(url, { waitMs: waitMs + 1500 });
    }
    if (!noWait) {
      await page.waitFor(`(document.querySelector("main")?.innerText ?? document.body.innerText).length > 20`, { tries: 20, gap: 300 });
    }
    await hideDevOverlay(page);
    if (settle) await sleep(settle);
    if (act) {
      const ok = await act(page);
      if (ok === false) { console.log(`  ⏭  ${group}/${id} — interaction not available`); return; }
      await sleep(650);
    }
    await shoot(page, group, id, { url });
  } catch (e) {
    console.log(`  ❌ ${group}/${id} — ${e.message}`);
    manifest.push({ group, id, url, error: e.message });
  }
}

// ─────────────────────────────────────────────────────────────── run ───────
const f = await fixtures();
console.log("fixtures:");
for (const [k, v] of Object.entries(f)) {
  if (k === "actors") continue;
  console.log(`  ${k}: ${v ? JSON.stringify(v).slice(0, 70) : "—"}`);
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await launch({ headless: true });
const page = await newPage(browser, "about:blank");
await page.setViewport(W, H);

const { screensFor } = await import("./shot-screens.list.mjs");
const { popupsFor } = await import("./shot-screens.popups.mjs");
const skipPopups = process.env.NO_POPUPS === "1";

try {
  const groups = wantGroups.length ? wantGroups : ["guest", "owner", "broker", "builder"];
  for (const group of groups) {
    console.log(`\n══ ${group} ${"═".repeat(50 - group.length)}`);
    if (group === "guest") {
      await page.send("Network.clearBrowserCookies");
    } else {
      const phone = ACTORS[group];
      if (!phone) { console.log(`  no actor for ${group}`); continue; }
      const { jar, user } = await cookiesFor(phone);
      await applyCookies(page, jar);
      console.log(`  logged in as ${user.name} (${user.role})`);
    }
    for (const s of screensFor(group, f, HOST)) {
      await screen(page, group, s.id, s.url, s);
    }
    if (!skipPopups) {
      console.log(`── ${group}: sheets, dialogs and states ──`);
      for (const s of popupsFor(group, f, HOST)) {
        await screen(page, group, s.id, s.url, s);
      }
    }
  }
} finally {
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n${shotCount} screens → ${OUT}`);
  await browser.close();
}

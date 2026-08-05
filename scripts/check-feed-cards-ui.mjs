/**
 * Feed cards — CLICK walk. Every control on both cards is pressed in a real
 * browser, and the row it was supposed to write is then read out of Postgres.
 *
 * The API sweep (check-feed-cards-live.mjs) proves the endpoints. This proves
 * the BUTTONS reach them: a handler wired to the wrong prop, a sheet that never
 * opens, a control that silently does nothing — none of that shows up in an
 * API test, and all three are exactly what this redesign was fixing.
 *
 *   PORT=3000 node scripts/check-feed-cards-ui.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { launchChrome, Session, sleep } from "./lib/cdp.mjs";
import { connect as dbConnect } from "./lib/dbx.mjs";

const PORT = process.env.PORT ?? "3000";
/**
 * The SELLER host, deliberately.
 *
 * `middleware.ts` makes the public host the guest surface only: a signed-in
 * visitor there has their auth cookies stripped from the request AND deleted
 * from the browser, so every gated control correctly opens the login sheet.
 * Walking the clicks on localhost therefore reports Save, Inquiry and Call as
 * dead buttons when they are simply on the wrong host. The authenticated feed
 * is seller.<host>, and that is what this exercises.
 */
const APP = process.env.APP ?? `http://seller.localhost:${PORT}`;
const PUBLIC_APP = `http://localhost:${PORT}`;
const ACTOR = process.env.ACTOR ?? "+919812300099"; // Rupal Kachhadiya — Rajkot owner (the city with live projects)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// A POOL, not a single client: the walk is minutes long and an idle Postgres
// connection gets dropped mid-run — the pool just opens another one.
// The DIRECT host drops out often enough — DNS, and an IPv6 route that goes
// dark — that a one-host client turns a run into a false failure. dbx.mjs walks
// the ladder q.mjs and db-proof.mjs already use: direct, then the poolers.
const pgc = await dbConnect();
pgc.on("error", () => { /* a dropped idle connection is not a test failure */ });

/**
 * Query with one retry. The walk spends minutes in the browser between reads,
 * and Supabase closes the idle connection in the meantime — the first query
 * after a long gap fails with "Connection terminated unexpectedly", which is
 * the harness's connection dying, not the app misbehaving.
 */
const q = async (s, p) => {
  try { return await pgc.query(s, p); }
  catch { await sleep(500); return await pgc.query(s, p); }
};
const row1 = async (s, p) => (await q(s, p)).rows[0];

let fails = 0;
const check = (cond, label, extra = "") => {
  if (!cond) fails++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " — " + extra : ""}`);
};
const section = (t) => console.log(`\n=== ${t} ===`);

const chrome = await launchChrome({ port: 9342 });
const sess = await Session.connect(chrome.wsUrl);

/** Every /api/v1 request the page makes, straight off the wire. */
const net = [];
const pending = new Map();
sess.ws._handlers.push((msg) => {
  if (msg.sessionId !== sess.sessionId) return;
  if (msg.method === "Network.requestWillBeSent" && String(msg.params.request.url).includes("/api/v1")) {
    pending.set(msg.params.requestId, `${msg.params.request.method} ${new URL(msg.params.request.url).pathname}`);
  }
  if (msg.method === "Network.responseReceived" && pending.has(msg.params.requestId)) {
    net.push(`${pending.get(msg.params.requestId)} → ${msg.params.response.status}`);
    pending.delete(msg.params.requestId);
  }
});

/** Click by a DOM predicate evaluated in the page, so no coordinates are guessed. */
const clickIn = (cardSel, btnSel) => sess.eval(`(() => {
  const a = ${cardSel};
  if (!a) return 'no-card';
  const b = a.querySelector(${JSON.stringify(btnSel)});
  if (!b) return 'no-button';
  b.click();
  return 'ok';
})()`);

const PROJECT_CARD = `[...document.querySelectorAll('article')].find(a => a.innerText.startsWith('NEW PROJECT'))`;
const PROPERTY_CARD = `[...document.querySelectorAll('article')].find(a => !a.innerText.startsWith('NEW PROJECT') && /₹/.test(a.innerText))`;

try {
  await sess.setViewport(390, 800, 2, true);
  const me = await row1("select id, name from profiles where phone = $1", [ACTOR]);

  // Log in INSIDE the browser, not by injecting cookies. The session cookies
  // are host-only + httpOnly (lib/auth/session.ts), and a CDP-injected copy is
  // not attached to the document request — the page then renders as a guest and
  // every gated control opens the login sheet, which reads exactly like a
  // broken button. Doing the real OTP round-trip in-page avoids that entirely.
  await sess.goto(`${APP}/`, { waitMs: 1500 });
  // Each actor presents its own forwarded client IP — what N real users on N
  // devices look like. The per-IP OTP cap (10/day) exists to stop one attacker
  // enumerating numbers, and every QA run shares one machine, so without this
  // the second run of the day is 429 and reads like an auth bug. The per-NUMBER
  // limit is left fully in force. Same rule as scripts/lib/session.mjs.
  const actorIp = `203.0.113.${([...ACTOR].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % 254) + 1}`;
  const auth = await sess.eval(`(async () => {
    const H = { 'content-type': 'application/json', 'x-forwarded-for': ${JSON.stringify(actorIp)} };
    const r = await fetch('/api/v1/auth/otp/request', { method: 'POST', headers: H, body: JSON.stringify({ phone: ${JSON.stringify(ACTOR)} }) });
    const j = await r.json();
    if (!j.ok) return 'request: ' + (j.error?.code ?? r.status);
    const v = await fetch('/api/v1/auth/otp/verify', { method: 'POST', headers: H, body: JSON.stringify({ otpSession: j.data.otpSession, code: j.data.devCode ?? '123456' }) });
    const vj = await v.json();
    if (!vj.ok) return 'verify: ' + (vj.error?.code ?? v.status);
    const who = await (await fetch('/api/v1/auth/me', { cache: 'no-store' })).json();
    return who?.data?.user?.name ?? 'no-session';
  })()`);
  check(auth === me.name, `signed in as ${me.name}`, String(auth));
  if (auth !== me.name) throw new Error(`cannot run the click walk signed out (${auth})`);

  /** Load the feed fresh and wait for real cards (not skeletons). */
  const openFeed = async () => {
    await sess.goto(`${APP}/`, { waitMs: 2500 });
    for (let i = 0; i < 60; i++) {
      if (await sess.eval(`document.querySelectorAll('article').length > 0`)) break;
      await sleep(400);
    }
    await sess.eval(`window.__open = []; window.open = (u) => { window.__open.push(u); return null; }; true`);
    net.length = 0;
  };
  /**
   * Requests are collected from CDP, NOT by monkey-patching window.fetch. The
   * patch version wrapped every call in an extra clone()/text() and any throw
   * inside it was swallowed by the client's own try/catch — so instrumenting
   * the page silently broke the very requests it was there to observe.
   */
  const calls = async (match) => JSON.stringify(net.filter((c) => c.includes(match)));

  /**
   * Click something and report where the app WENT. No pushState interception:
   * the app router is the thing under test, so the assertion is the real URL
   * after the click, and the feed is reloaded for the next one.
   */
  const clickAndLand = async (cardSel, pick) => {
    await openFeed();
    const res = await sess.eval(`(() => {
      const a = ${cardSel};
      if (!a) return 'no-card';
      const b = ${pick};
      if (!b) return 'no-button';
      b.click();
      return 'ok';
    })()`);
    if (res !== "ok") return res;
    // Generous: in dev the first hit on /project or /profile compiles the route,
    // which can take several seconds — a short poll reports a working button as
    // a dead one.
    for (let i = 0; i < 120; i++) {
      const p = await sess.eval(`location.pathname`);
      if (p !== "/") return p;
      await sleep(250);
    }
    return "(stayed on /)";
  };

  await openFeed();

  section("1 · Project card — every control");

  const projectTitle = await sess.eval(`(${PROJECT_CARD})?.innerText.split('\\n').find(l => !/^(NEW PROJECT|PROMOTED|UNDER|READY|BOOKING)/.test(l))`);
  check(Boolean(projectTitle), "a project card is on the feed", projectTitle ?? "");

  const projectId = await clickAndLand(PROJECT_CARD, `a.querySelector('button[aria-label^="Open"]')`);
  check(String(projectId).startsWith("/project/"), "cover tap → /project/:id", String(projectId));

  const viewBtn = await clickAndLand(PROJECT_CARD, `[...a.querySelectorAll('button')].find(x => x.innerText.trim() === 'View Project')`);
  check(String(viewBtn).startsWith("/project/"), "View Project → /project/:id", String(viewBtn));

  const pid = [projectId, viewBtn].map(String).find((p) => p.startsWith("/project/"))?.split("/").pop();
  if (!pid || !/^[0-9a-f-]{36}$/i.test(pid)) {
    // Projects are city-scoped like every other card, so an actor whose city
    // has no live project simply has no project card to walk. Say that, rather
    // than reporting the feed broken.
    throw new Error(`no project card for ${me.name}: pick an ACTOR in a city that has a live project (${projectId} / ${viewBtn})`);
  }

  // The poster row either OPENS the profile or says there isn't one — a builder
  // with no username has no public URL, and pushing one would 404. Which of the
  // two is correct is a fact about the row, so ask the row.
  const poster = await row1("select p.username from projects pr join profiles p on p.id = pr.profile_id where pr.id = $1", [pid]);
  const openPoster = await clickAndLand(PROJECT_CARD, `a.querySelector('button[aria-label^="View "]')`);
  if (poster?.username) {
    check(String(openPoster) === `/profile/${poster.username}`, "poster tap → their public profile", String(openPoster));
  } else {
    const toast = await sess.eval(`document.body.innerText.includes('no public profile')`);
    check(openPoster === "(stayed on /)" && toast === true, "poster with no username → told, not 404'd", `${openPoster}`);
  }

  await openFeed();

  // ---- Call: a dialler can't open in headless, so the assertion is the
  // request it must fire (and the lead row behind it), not the tel: URL.
  const project = await row1("select name from projects where id = $1", [pid]);
  await q("delete from leads where project_id = $1 and lead_profile_id = $2", [pid, me.id]);
  // Proof is the row, not the request: the tap sets location.href = tel:, and
  // the browser starts leaving the page while the fire-and-forget POST is in
  // flight, so CDP often never reports its response. Retried for the same
  // reason Save is — a pre-hydration click lands on nothing.
  let callLead = null;
  let callClick = "";
  for (let attempt = 0; attempt < 3 && !callLead; attempt++) {
    if (attempt > 0) await openFeed();
    callClick = String(await clickIn(PROJECT_CARD, 'button[aria-label="Call builder"]'));
    await sleep(2500);
    callLead = await row1(
      "select last_activity from leads where project_id = $1 and lead_profile_id = $2", [pid, me.id]);
  }
  check(/Call/i.test(callLead?.last_activity ?? ""), "Call records the lead before dialling",
    callLead?.last_activity ?? `no lead (click=${callClick})`);

  await clickIn(PROJECT_CARD, 'button[aria-label="WhatsApp builder"]');
  await sleep(1800);
  const wa = await sess.eval(`decodeURIComponent(window.__open[window.__open.length - 1] ?? '(none)')`);
  check(String(wa).includes("wa.me/"), "WhatsApp button opens wa.me", String(wa).slice(0, 110));
  check(String(wa).includes(project.name), "…with the project NAME in the message", project.name);
  check(String(wa).toLowerCase().includes("more details"), "…and asks for more details");

  const leadAfter = await row1(
    `select l.id, l.last_activity, l.stage from leads l where l.project_id = $1 and l.lead_profile_id = $2`, [pid, me.id]);
  check(Boolean(leadAfter), "the two taps wrote a real `leads` row", leadAfter ? `${leadAfter.stage}: ${leadAfter.last_activity}` : "(none)");

  await clickIn(PROJECT_CARD, 'button[aria-label="More"]');
  await sleep(600);
  const sheet = await sess.eval(`(() => {
    const t = document.body.innerText;
    return JSON.stringify({ share: t.includes('Share'), report: t.includes('Report'), notInterested: t.includes('Not interested') });
  })()`);
  const sheetJson = JSON.parse(sheet);
  check(sheetJson.share && sheetJson.report, "⋯ opens Options with Share + Report");
  check(!sheetJson.notInterested, "…and NO 'Not interested' (removed 28 Jul 2026)");

  section("2 · Property card — every control");

  await openFeed();
  // Pin ONE card by its title for the whole section. `PROPERTY_CARD` re-resolves
  // on every eval, and the feed's first property card is not always the same
  // one (a boost can be injected between reloads) — so a Save could be clicked
  // on card A while the row was looked up for card B, and read as a dead button.
  const pinnedTitle = await sess.eval(`(() => {
    const a = [...document.querySelectorAll('article')].find(x =>
      !x.innerText.startsWith('NEW PROJECT') && x.querySelector('button[aria-label="Save"], button[aria-label="Saved"]'));
    return a ? a.innerText.split('\\n').find(l => l.length > 12 && !/^(PROMOTED|FOR |\\d+\\/\\d+)/.test(l)) ?? '' : '';
  })()`);
  check(Boolean(pinnedTitle), "a foreign property card (with a Save control) is on the feed", String(pinnedTitle));
  const CARD = `[...document.querySelectorAll('article')].find(x => x.innerText.includes(${JSON.stringify(pinnedTitle)}))`;

  const propId = await clickAndLand(CARD, `[...a.querySelectorAll('button')].find(x => x.innerText.trim() === 'View')`);
  check(String(propId).startsWith("/property/"), "View → /property/:id", String(propId));
  const lid = String(propId).split("/").pop();

  // Clear what a previous run left behind BEFORE the feed is rendered — the
  // card's `saved` flag is baked into the payload, so deleting the row after
  // the page has loaded leaves a filled heart that the next tap simply
  // un-saves, and the walk reads that as "Save wrote nothing".
  await q("delete from saves where listing_id = $1 and profile_id = $2", [lid, me.id]);
  await q("delete from inquiries where listing_id = $1 and profile_id = $2", [lid, me.id]);
  await openFeed();

  // Clicked twice if need be: a click that lands before React has hydrated the
  // card does nothing at all, and that is a property of the harness, not of the
  // button — the run must not report it as a dead control.
  let saveState = "(not clicked)";
  let savedRow = null;
  for (let attempt = 0; attempt < 3 && !savedRow; attempt++) {
    saveState = await sess.eval(`(() => {
      const a = ${CARD};
      if (!a) return '(card gone)';
      const b = a.querySelector('button[aria-label="Save"], button[aria-label="Saved"]');
      if (!b) return '(no save button)';
      const before = b.getAttribute('aria-label');
      b.click();
      return before;
    })()`);
    await sleep(2000);
    savedRow = await row1("select id from saves where listing_id = $1 and profile_id = $2", [lid, me.id]);
  }
  const savedLabel = await sess.eval(`(${CARD})?.querySelector('button[aria-label="Save"], button[aria-label="Saved"]')?.getAttribute('aria-label')`);
  check(Boolean(savedRow), "Save button wrote a `saves` row", savedRow ? `id=${savedRow.id}` : `clicked=${saveState}, calls=${await calls("/saves")}`);
  check(savedLabel === "Saved", "…and the heart filled in the UI", `${saveState} → ${savedLabel}`);
  // put it back
  await clickIn(CARD, 'button[aria-label="Saved"]');
  await sleep(1600);
  const unsaved = await row1("select id from saves where listing_id = $1 and profile_id = $2", [lid, me.id]);
  check(!unsaved, "second tap removed the row again");

  await sess.eval(`(() => {
    const a = ${CARD};
    [...a.querySelectorAll('button')].find(x => x.innerText.trim() === 'Inquiry').click();
    return true;
  })()`);
  await sleep(900);
  const prefill = await sess.eval(`document.querySelector('textarea')?.value ?? '(no sheet)'`);
  check(prefill !== "(no sheet)", "Inquiry opens the sheet");
  check(/more details/i.test(prefill), "…prefilled asking for more details", prefill.slice(0, 90));

  const sent = await sess.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Send Inquiry');
    if (!b) return 'no-button';
    b.click();
    return 'ok';
  })()`);
  // Sending also grows the chat thread (ensureInquiryThread), so the round trip
  // is several queries long — poll for the row instead of assuming one sleep is
  // enough, and click once more if the first landed pre-hydration.
  let inqRow = null;
  for (let i = 0; i < 12 && !inqRow; i++) {
    await sleep(1000);
    inqRow = await row1("select id, status, message from inquiries where listing_id = $1 and profile_id = $2", [lid, me.id]);
    if (!inqRow && i === 5) {
      await sess.eval(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Send Inquiry'); if (b) b.click(); return true; })()`);
    }
  }
  check(sent === "ok" && Boolean(inqRow), "Send Inquiry wrote an `inquiries` row (click=" + sent + ")",
    inqRow ? `${inqRow.status}: ${inqRow.message.slice(0, 50)}` : `calls=${await calls("/inquiries")}`);

  section("3 · Console + network");
  const errs = (sess.consoleErrors ?? []).filter((e) => !/favicon|manifest/i.test(String(e)));
  check(errs.length === 0, "no console errors during the walk", errs.slice(0, 3).join(" | "));
} finally {
  await sess.close().catch(() => {});
  chrome.proc.kill();
  await pgc.end().catch(() => {});
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`}`);
process.exit(fails === 0 ? 0 : 1);

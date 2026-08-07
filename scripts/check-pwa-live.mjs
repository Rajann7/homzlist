/**
 * Module 13 live check — PWA + smoothness, in a real browser.
 *
 * Everything here is verified by LOOKING at a running app (Doc6 §8 / CLAUDE.md
 * rule 13), never by asserting about source code. Built on the repo's existing
 * CDP client (scripts/lib/cdp.mjs), the same one the pixel-diff tooling uses.
 *
 *   npm run dev                                    # in another terminal
 *   QA_LISTING_ID=<a live listing id> npm run check:pwa
 *
 * Covers: the offline banner, the offline write-queue draining into Supabase,
 * the install-prompt lifecycle (including the weekly snooze), back-closes-sheets,
 * scroll restore, the build version, manifest shortcuts, and an every-screen
 * sweep for photos stuck invisible / horizontal overflow / 5xx.
 */
import { launchChrome, Session, sleep, ev, devLogin } from "./lib/cdp.mjs";

const PUBLIC = process.env.QA_PUBLIC_ORIGIN || "http://localhost:3000";
const SELLER = process.env.QA_SELLER_ORIGIN || "http://seller.localhost:3000";

const results = [];
function rec(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail ? `\n         ${String(detail).slice(0, 260)}` : ""}`);
}

/* --------------------------------------------------------------- snippets */

/**
 * A photo the browser has finished loading must be VISIBLE — this is the check
 * that would have caught a `<Img>` fade stuck at opacity 0. Only judged for
 * images that actually loaded ("not loaded yet" is not a verdict), and photos
 * the DESIGN dims on purpose (archived tiles are 0.6) are skipped by class, so
 * the check stays about the bug it exists for.
 */
const AUDIT = `
  const dimmedByDesign = /opacity-[1-9]0\\b/;
  const imgs = [...document.querySelectorAll('img')];
  const invisible = [];
  for (const im of imgs) {
    const r = im.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (!im.complete || im.naturalWidth === 0) continue;
    if (dimmedByDesign.test(im.className)) continue;
    if (parseFloat(getComputedStyle(im).opacity) < 0.9)
      invisible.push((im.currentSrc || im.src).slice(-40));
  }
  const de = document.documentElement;
  const scroller = [...document.querySelectorAll('main, div')].find(e => {
    const cs = getComputedStyle(e);
    return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 40;
  });
  const nav = document.querySelector('nav[aria-label="Primary"]');
  return {
    imgs: imgs.length,
    loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
    invisible,
    docX: de.scrollWidth - de.clientWidth,
    scrollerX: scroller ? scroller.scrollWidth - scroller.clientWidth : null,
    navPinned: nav ? Math.abs(nav.getBoundingClientRect().bottom - window.innerHeight) < 2 : null,
    empty: document.body.innerText.trim().length < 30,
  };
`;

/** The app has three shells and only one uses <main>; find the real scroller. */
const SCROLLER = `
  const el = [...document.querySelectorAll('main, div')].find(e => {
    const cs = getComputedStyle(e);
    return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 40;
  });`;

const OFFLINE_BAR = `
  const el = [...document.querySelectorAll('div')].find(d => d.textContent.trim().startsWith("You're offline"));
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { text: el.textContent.trim(), bg: cs.backgroundColor, fontSize: cs.fontSize };
`;

const INSTALL_CARD = `
  const el = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Install HomzList');
  if (!el) return null;
  const row = el.closest('div').parentElement;
  const tile = row.querySelector('span');
  const cs = getComputedStyle(tile);
  return { copy: row.innerText.split('\\n').join(' | '), tileSize: cs.width + 'x' + cs.height,
           tileRadius: cs.borderRadius, tileType: cs.fontSize + '/' + cs.fontWeight, tileBg: cs.backgroundColor };
`;

/**
 * Chrome decides for itself when to fire `beforeinstallprompt` (and in dev there
 * is no service worker, since it only registers in production), so dispatching
 * it makes the check about OUR handler rather than about Chrome's scheduling.
 */
const FIRE_BIP = `
  const e = new Event('beforeinstallprompt');
  e.prompt = () => Promise.resolve();
  Object.defineProperty(e, 'userChoice', { value: Promise.resolve({ outcome: 'dismissed' }) });
  window.dispatchEvent(e);
  return 1;
`;

const READ_QUEUE = `
  return await new Promise((resolve) => {
    const req = indexedDB.open('hz-offline', 1);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('queue')) return resolve([]);
      const all = db.transaction('queue', 'readonly').objectStore('queue').getAll();
      all.onsuccess = () => resolve(all.result.map(r => ({ kind: r.kind, path: r.path, method: r.method })));
      all.onerror = () => resolve('read error');
    };
    req.onerror = () => resolve('open error');
  });
`;

const OFFLINE = { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 };
const ONLINE = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };

const SCREENS = [
  ["Messages", `${SELLER}/messages`], ["Saved", `${SELLER}/saved`],
  ["Own profile", `${SELLER}/profile`], ["Notifications", `${SELLER}/notifications`],
  ["My listings", `${SELLER}/listings`], ["Leads", `${SELLER}/leads`],
  ["Visits", `${SELLER}/visits`], ["Requirements", `${SELLER}/requirements`],
  ["Proposals", `${SELLER}/proposals`], ["Activity", `${SELLER}/activity`],
  ["Archived", `${SELLER}/archived`], ["Plans", `${SELLER}/plans`],
  ["Payments", `${SELLER}/payments`], ["Dashboard", `${SELLER}/dashboard`],
  ["Settings", `${SELLER}/settings`], ["Help", `${SELLER}/help`],
  ["Create", `${SELLER}/create`], ["Blog", `${PUBLIC}/blog`],
  ["Search home", `${PUBLIC}/search`], ["Projects browse", `${PUBLIC}/projects`],
  ["Requirements browse", `${PUBLIC}/requirements`],
];

/* ------------------------------------------------------------------- main */

async function mobile(chrome) {
  const s = await Session.connect(chrome.wsUrl);
  await s.setViewport(375, 812, 2, true);
  await s.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  return s;
}

async function main() {
  const listingId = process.env.QA_LISTING_ID;
  const chrome = await launchChrome({ port: Number(process.env.QA_CDP_PORT || 9334) });
  const g = await mobile(chrome); // guest
  const safe = async (body, fb = null) => { try { return await ev(g, body); } catch { return fb; } };

  console.log("\n— Guest feed —");
  await g.goto(`${PUBLIC}/`, { waitMs: 4000 });
  await safe(`${SCROLLER} if (el) { el.scrollTop = 500; el.dispatchEvent(new Event('scroll')); } return 1`);
  await sleep(6000);

  const a = await safe(AUDIT, {});
  rec("Feed — no loaded photo stuck invisible", (a.invisible || []).length === 0,
      `${a.loaded}/${a.imgs} loaded · ${JSON.stringify(a.invisible)}`);
  rec("Feed — nav pinned, no horizontal overflow",
      a.navPinned === true && a.docX <= 0 && (a.scrollerX ?? 0) <= 0,
      `docX=${a.docX} scrollerX=${a.scrollerX} nav=${a.navPinned}`);
  rec("Feed — no offline banner while online", (await safe(OFFLINE_BAR)) === null);

  console.log("\n— Offline banner (P12) —");
  await g.send("Network.emulateNetworkConditions", OFFLINE);
  await sleep(1500);
  const bar = await safe(OFFLINE_BAR);
  rec("Banner shows with the design's copy and tokens",
      !!bar && bar.text === "You're offline — showing saved data" && bar.fontSize === "13px" && bar.bg === "rgb(17, 17, 17)",
      JSON.stringify(bar));
  const withBar = await safe(AUDIT, {});
  rec("Banner does not push the nav off or cause overflow",
      withBar.navPinned === true && withBar.docX <= 0, `docX=${withBar.docX} nav=${withBar.navPinned}`);
  await g.send("Network.emulateNetworkConditions", ONLINE);
  await sleep(1800);
  rec("Banner clears on reconnect", (await safe(OFFLINE_BAR)) === null);

  console.log("\n— Install prompt (P12 / Doc3 §98) —");
  await safe(FIRE_BIP);
  await sleep(1200);
  const card = await safe(INSTALL_CARD);
  rec("Card renders with the design's copy",
      !!card && card.copy.includes("Install HomzList") && card.copy.includes("Fast, light, works offline"),
      card && card.copy);
  rec("Tile is the accent 44x44 rounded-10 'H'",
      !!card && card.tileSize === "44pxx44px" && card.tileRadius === "10px" && card.tileType === "20px/700",
      card && `${card.tileSize} r=${card.tileRadius} ${card.tileType} ${card.tileBg}`);
  await safe(`
    const label = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Install HomzList');
    if (label) {
      const cardEl = label.closest('div').parentElement;
      const x = [...cardEl.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Dismiss');
      if (x) x.click();
    }
    return 1;
  `);
  await sleep(700);
  rec("Dismiss snoozes it (timestamp recorded, card gone)",
      (await safe(INSTALL_CARD)) === null && !!(await safe(`return localStorage.getItem('hz-install-snoozed-at')`)));
  await g.goto(`${PUBLIC}/`, { waitMs: 4000 });
  await safe(FIRE_BIP); await sleep(1200);
  rec("Stays snoozed on reload (no nagging)", (await safe(INSTALL_CARD)) === null);
  await safe(`localStorage.setItem('hz-install-snoozed-at', String(Date.now() - 8*24*60*60*1000)); return 1`);
  await g.goto(`${PUBLIC}/`, { waitMs: 4000 });
  await safe(FIRE_BIP); await sleep(1200);
  rec("Returns after 7 days — weekly, not 'never again'", (await safe(INSTALL_CARD)) !== null);

  console.log("\n— Manifest —");
  const shortcuts = await safe(`const r = await fetch('/manifest.webmanifest'); const j = await r.json(); return j.shortcuts.map(s => s.name);`);
  rec("Shortcuts are New listing / Messages / Search (Doc3 §98)",
      JSON.stringify(shortcuts) === JSON.stringify(["New listing", "Messages", "Search"]), JSON.stringify(shortcuts));

  console.log("\n— Scroll restore (Doc8 §193) —");
  await g.goto(`${PUBLIC}/`, { waitMs: 6000 });
  const saved = await safe(`
    ${SCROLLER}
    if (!el) return null;
    el.scrollTop = 1200; el.dispatchEvent(new Event('scroll'));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 400));
    return { at: el.scrollTop, saved: sessionStorage.getItem('hz-scroll:/') };
  `);
  rec("Feed offset is recorded", !!saved && Number(saved.saved) > 0, JSON.stringify(saved));
  await safe(`const a = document.querySelector('a[href="/search"]'); if (a) a.click(); else location.href='/search'; return 1`);
  await sleep(4000);
  await safe(`history.back(); return 1`);
  await sleep(6000);
  const back = await safe(`${SCROLLER} return { path: location.pathname, at: el ? el.scrollTop : null }`);
  rec("Back to the feed returns to that offset", !!back && back.path === "/" && back.at > 400, JSON.stringify(back));
  await g.goto(`${PUBLIC}/search`, { waitMs: 3000 });
  await g.goto(`${PUBLIC}/`, { waitMs: 5000 });
  rec("A fresh navigation still opens at the top",
      (await safe(`${SCROLLER} return el ? el.scrollTop : null`)) === 0);

  /* --------------------------------------------------- signed-in section -- */
  console.log("\n— Signed in —");
  // seller.* is a different origin; a fresh tab avoids tearing the guest one down.
  const s = await mobile(chrome);
  const ss = async (body, fb = null) => { try { return await ev(s, body); } catch { return fb; } };

  const landed = await devLogin(s, { sellerOrigin: SELLER });
  const isIn = typeof landed === "string" && !landed.includes("/login") && !landed.startsWith("no ");
  rec("Dev OTP sign-in works", isIn, `landed on ${landed}`);
  if (!isIn) return finish(chrome);

  await s.goto(`${SELLER}/settings`, { waitMs: 4000 });
  const version = await ss(`
    const el = [...document.querySelectorAll('div')].find(d => /^Version /.test(d.textContent.trim()) && d.children.length === 0);
    return el ? el.textContent.trim() : null;
  `);
  rec("Settings shows a real build version (not the old hardcoded one)",
      !!version && !/1\.0\.2|build 148/.test(version) && /^Version \S+ \(build \S+\)$/.test(version), version);

  console.log("\n— Back closes sheets (Doc3 §98) —");
  const sheet = await ss(`
    const pathBefore = location.pathname;
    const open = () => { const r = [...document.querySelectorAll('button')].find(b => /appearance/i.test(b.textContent)); if (r) r.click(); return !!r; };
    if (!open()) return { err: 'no Appearance row' };
    await new Promise(r => setTimeout(r, 700));
    const opened = !!document.querySelector('[role=dialog]');
    history.back();
    await new Promise(r => setTimeout(r, 900));
    const closedByBack = !document.querySelector('[role=dialog]');
    const pathAfterBack = location.pathname;
    open();
    await new Promise(r => setTimeout(r, 700));
    const lenOpen = history.length;
    const x = [...document.querySelectorAll('[role=dialog] button')].find(b => (b.getAttribute('aria-label')||'').toLowerCase() === 'close');
    if (x) x.click();
    await new Promise(r => setTimeout(r, 900));
    return { opened, closedByBack, pathBefore, pathAfterBack, closedByX: !document.querySelector('[role=dialog]'),
             pathAfterX: location.pathname, lenOpen, lenAfterX: history.length };
  `, {});
  rec("Sheet opens", sheet.opened === true, JSON.stringify(sheet));
  rec("Back closes it instead of leaving the screen",
      sheet.closedByBack === true && sheet.pathAfterBack === sheet.pathBefore,
      `${sheet.pathBefore} -> ${sheet.pathAfterBack}`);
  rec("X closes it and the pushed history entry is popped",
      sheet.closedByX === true && sheet.pathAfterX === sheet.pathBefore && sheet.lenAfterX <= sheet.lenOpen,
      `history ${sheet.lenOpen} -> ${sheet.lenAfterX}`);

  if (listingId) {
    console.log("\n— Offline write-queue (Doc3 §98) —");
    await s.goto(`${SELLER}/property/${listingId}`, { waitMs: 5000 });
    await s.send("Network.emulateNetworkConditions", OFFLINE);
    await sleep(1500);
    await ss(`
      const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').toLowerCase().includes('save'));
      if (b) b.click();
      return 1;
    `);
    await sleep(2500);
    const queued = await ss(READ_QUEUE, []);
    rec("A save made offline is queued in IndexedDB",
        Array.isArray(queued) && queued.some((q) => q.path === "/api/v1/saves"), JSON.stringify(queued));
    await s.send("Network.emulateNetworkConditions", ONLINE);
    await sleep(7000);
    const left = await ss(READ_QUEUE, null);
    rec("It drains by itself on reconnect (no user action)", Array.isArray(left) && left.length === 0, JSON.stringify(left));
    console.log(`         → confirm the row moved:  npm run q "select listing_id, created_at from saves order by created_at desc limit 3"`);
  } else {
    console.log("\n  (offline-queue check skipped — set QA_LISTING_ID to a live listing id)");
  }

  /* ------------------------------------------------------ screen sweep --- */
  console.log("\n— Every screen: photos visible, no overflow, no 5xx —");
  for (const [name, url] of SCREENS) {
    const mark = s.responses.length;
    await s.goto(url, { waitMs: 4000 });
    await ss(`${SCROLLER} if (el) { el.scrollTop = 600; el.dispatchEvent(new Event('scroll')); } return 1`);
    await sleep(2200);
    const r = await ss(AUDIT, { err: "eval failed" });
    const server5xx = s.responses.slice(mark).filter((x) => x.status >= 500).map((x) => `${x.status} ${x.url.slice(-46)}`);
    const bad = [];
    if (r.err) bad.push(r.err);
    if (r.invisible?.length) bad.push(`INVISIBLE: ${r.invisible.join(", ")}`);
    if (r.docX > 0) bad.push(`doc overflow-x ${r.docX}px`);
    if (r.scrollerX > 0) bad.push(`scroller overflow-x ${r.scrollerX}px`);
    if (r.empty) bad.push("rendered empty");
    if (server5xx.length) bad.push(server5xx.join(" | "));
    rec(`${name.padEnd(20)} photos ${String(r.loaded ?? 0).padStart(3)}/${String(r.imgs ?? 0).padEnd(3)}`,
        bad.length === 0, bad.join(" · "));
  }

  finish(chrome);
}

function finish(chrome) {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n==== ${results.length - failed.length}/${results.length} checks passed ====`);
  if (failed.length) console.log(failed.map((f) => " FAIL " + f.name).join("\n"));
  try { chrome.proc.kill(); } catch { /* already gone */ }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error("HARNESS ERROR:", e.stack); process.exit(2); });

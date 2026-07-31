/**
 * Proof that the pixdiff harness can drive the ADMIN prototype's three device
 * bands — the thing the last attempt skipped, and the reason a 1049px table
 * shipped onto a 390px screen.
 *
 *   node scripts/check-p13-bands.mjs            # every screen, 3 bands
 *   node scripts/check-p13-bands.mjs users      # one screen
 *   PORT=3000 node scripts/check-p13-bands.mjs
 *
 * For each screen × band it reports the width the prototype's own frame renders
 * at. If the design frame is not 390 / 768 / 1440, the harness is not actually
 * in that band and every diff taken there would be meaningless.
 */
import { launchChrome, Session, sleep } from "./lib/cdp.mjs";

const PORT = process.env.PORT ?? "3000";
const DESIGN = `http://localhost:${PORT}/_dx/P13.html`;
const BANDS = { mobile: 390, tablet: 768, desktop: 1440 };

const DRIVER = `
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

/**
 * The prototype draws its device frame as a rounded, shadowed card floating on a
 * 24px desk (`deskPad`, template 416) and caps it at `calc(100vh - 48px)`. That
 * desk is the PREVIEW's chrome, not the design — left in place it clamps the
 * frame to viewport−48 (a 768 browser gives a 720 "tablet"), and puts rounded
 * corners around every screenshot. Flatten it so the frame IS the viewport.
 */
const NORMALIZE_FRAME = `
(() => {
  const desk = document.querySelector('[data-theme]');
  const frame = desk && desk.firstElementChild;
  if (!desk || !frame) return false;
  desk.style.padding = '0';
  desk.style.background = 'var(--page)';
  desk.style.minHeight = '100vh';
  frame.style.width = '100%';
  frame.style.maxWidth = 'none';
  frame.style.height = '100vh';
  frame.style.maxHeight = 'none';
  frame.style.borderRadius = '0';
  frame.style.boxShadow = 'none';
  return true;
})()`;

/** The frame is the element carrying the design's own device width. */
const MEASURE = `
(() => {
  const frame = document.querySelector('[data-theme] > div');
  const sidebar = document.querySelector('aside');
  const table = [...document.querySelectorAll('table')]
    .map(t => t.getBoundingClientRect().width).sort((a,b)=>b-a)[0] ?? 0;
  return {
    frame: frame ? Math.round(frame.getBoundingClientRect().width) : 0,
    sidebar: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
    widestTable: Math.round(table),
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
})()`;

const SCREENS = [
  "dashboard", "listings", "review", "requirements", "boosts", "verifications",
  "appeals", "reports", "users", "listingsMaster", "payments", "finance",
  "plans", "coupons", "grants", "masterData", "cms", "templates", "settings",
  "tickets", "disputes", "staff", "audit", "cron", "analytics", "trash", "exports",
];

const only = process.argv.slice(2);
const screens = only.length ? SCREENS.filter((s) => only.some((f) => s.toLowerCase().includes(f.toLowerCase()))) : SCREENS;

const chrome = await launchChrome();
const sess = await Session.connect(chrome.wsUrl);

// The prototype is 2,700 lines of JSX compiled by Babel IN the page, so a
// reload costs ~15s. Its device state is React state, not a media query, so the
// page is loaded ONCE and driven with setState from there — 81 states in about
// the time three reloads used to take.
await sess.goto(DESIGN, { waitMs: 2000 });
if (!(await sess.eval(DRIVER))) throw new Error("could not reach the P13 prototype state");

let bad = 0;
for (const screen of screens) {
  const cells = [];
  for (const [band, w] of Object.entries(BANDS)) {
    await sess.setViewport(w, 900);
    await sess.eval(`window.__dc.setState({screen:${JSON.stringify(screen)},viewport:${JSON.stringify(band)}}); true`);
    await sleep(400);
    await sess.eval(NORMALIZE_FRAME);
    await sleep(150);
    const m = await sess.eval(MEASURE);
    const ok = m.frame === w;
    if (!ok) bad++;
    cells.push(`${band.padEnd(7)} frame ${String(m.frame).padStart(4)}${ok ? " " : "✗"} sidebar ${String(m.sidebar).padStart(3)} table ${String(m.widestTable).padStart(4)}${m.hScroll ? " HSCROLL" : ""}`);
  }
  console.log(`${screen.padEnd(15)} ${cells.join("  |  ")}`);
}

await sess.close();
chrome.proc.kill();
console.log(bad ? `\n${bad} band(s) did not render at the expected width` : `\nall ${screens.length * 3} screen×band states rendered at the design's width`);
process.exit(bad ? 1 : 0);

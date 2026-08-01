/**
 * P4's §9 gate 7: no horizontal page scroll, no clipped text, no console errors
 * — A10 and A12, at all three of the design's bands.
 *
 * It also asserts the DEVICE BRANCHES the design writes, so a screen cannot
 * quietly lose one: A10's mobile card list, A12's mobile card list WITHOUT a
 * filter bar (template 1079), and both screens' tablet column drop.
 *
 *   PORT=3000 node scripts/check-admin-p4-bands.mjs
 */
import fs from "node:fs";
import { launchChrome, Session, sleep } from "./lib/cdp.mjs";

const PORT = process.env.PORT ?? "3000";
const BASE = `http://account.localhost:${PORT}`;

const E = {};
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const BANDS = [
  ["mobile", 390, 844],
  ["tablet", 768, 1024],
  ["desktop", 1440, 900],
];

let failures = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(52)} got=${String(got).padEnd(16)} want=${want}`);
};

const chrome = await launchChrome();
const s = await Session.connect(chrome.wsUrl);

await s.goto(`${BASE}/login`);
await s.eval(
  `fetch('/api/v1/admin/auth/dev',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(E.ADMIN_DEV_EMAIL)}})}).then(r=>r.json())`,
);

for (const [band, w, h] of BANDS) {
  console.log(`\n${band} · ${w}×${h}`);
  await s.setViewport(w, h, 1, band === "mobile");

  for (const path of ["/users", "/listings"]) {
    s.consoleErrors.length = 0;
    await s.goto(`${BASE}${path}`, { waitMs: 2000 });
    // A12 asks for ten tab counts over a union view; on a cold route that is
    // slower than a paint, and measuring mid-load is exactly how P3's harness
    // once reported an empty table as a pass.
    for (let i = 0; i < 40; i++) {
      const ready = await s.eval(
        `document.querySelectorAll('main table tbody tr, main [class*="md:hidden"] > div').length > 0`,
      );
      if (ready) break;
      await sleep(500);
    }

    const m = await s.eval(`(() => {
      // A hidden ANCESTOR is what hides these, and getComputedStyle reports only
      // the element's OWN display — so visibility is measured, not read.
      const visible = (e) => e.getClientRects().length > 0;
      const ths = [...document.querySelectorAll('thead th')].filter(visible);
      return {
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        tables: [...document.querySelectorAll('table')].filter(visible).length,
        cards: document.querySelectorAll('main [class*="md:hidden"] > div').length,
        columns: ths.length,
        // a filter pill row is the design's bar; A12 must not have one at 390
        pills: [...document.querySelectorAll('main button')].filter(
          (b) => visible(b) && /chevD|▾/.test(b.innerHTML) && b.offsetHeight === 32,
        ).length,
        searchBoxes: [...document.querySelectorAll('main input[placeholder]')].filter(visible).length,
        // text the browser is cutting off inside an overflow:hidden box
        clipped: [...document.querySelectorAll('main td, main th')].filter(
          (e) => visible(e) && e.scrollWidth > e.clientWidth + 2 &&
                 getComputedStyle(e).overflow === 'hidden',
        ).length,
      };
    })()`);

    check(`${path} ${band} · no horizontal page scroll`, m.scrollW <= m.innerW + 1, true);
    check(`${path} ${band} · no clipped cell`, m.clipped, 0);
    check(`${path} ${band} · no console errors`, s.consoleErrors.length, 0);
    if (s.consoleErrors.length) console.log("       ", s.consoleErrors[0]?.slice(0, 160));

    if (band === "mobile") {
      // the design's `if(mobile)` branch — a card list, never a table
      check(`${path} mobile · card list, no table`, m.tables, 0);
      check(`${path} mobile · cards rendered`, m.cards > 0, true);
      if (path === "/listings") {
        // template 1079 — head, chipRow, bulk, cards. No filter bar at all.
        check("/listings mobile · no filter bar (template 1079)", m.searchBoxes, 0);
      } else {
        // template 1019 — A10 KEEPS its bar on mobile
        check("/users mobile · keeps its filter bar (template 1019)", m.searchBoxes, 1);
      }
    } else {
      check(`${path} ${band} · table renders`, m.tables, 1);
      // A10 drops 4 columns on tablet (12 → 8), A12 drops 4 (11 → 7)
      const expected =
        path === "/users" ? (band === "tablet" ? 8 : 12) : band === "tablet" ? 7 : 11;
      check(`${path} ${band} · visible columns`, m.columns, expected);
    }
  }
}

await s.close();
chrome.proc.kill();
console.log(
  failures === 0
    ? "\nPASS — no horizontal page scroll, no clipped text, no console errors, every device branch present\n"
    : `\nFAIL — ${failures} problem(s)\n`,
);
process.exit(failures ? 1 : 0);

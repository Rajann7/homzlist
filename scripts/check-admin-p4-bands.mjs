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
/**
 * Screens are measured in parallel tabs, so a check writes into that screen's
 * own buffer and everything is printed in PATHS order at the end. Interleaved
 * output from four tabs is unreadable, and this script's whole value is being
 * able to see which screen broke.
 */
const makeCheck = (out) => (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) failures++;
  out.push(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(52)} got=${String(got).padEnd(16)} want=${want}`);
};

const chrome = await launchChrome();
const s = await Session.connect(chrome.wsUrl);

await s.goto(`${BASE}/login`);
await s.eval(
  `fetch('/api/v1/admin/auth/dev',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(E.ADMIN_DEV_EMAIL)}})}).then(r=>r.json())`,
);

const PATHS = [
  "/users", "/listings", "/coupons", "/grants", "/plans", "/payments", "/finance",
  "/master-data", "/cms", "/templates",
  "/settings", "/tickets", "/disputes", "/staff", "/audit", "/cron", "/analytics", "/trash", "/exports",
];

// Warm every route once before measuring anything.
//
// `next dev` compiles a route on its FIRST request, which is slower than the
// readiness wait below. Mobile is the first band in the loop, so a cold route
// always failed at mobile and passed at the other two — which reads exactly
// like a missing mobile branch and is not one. (It reported /cms as having no
// table at 390 while the same table rendered at 768 and 1440.)
//
// Warming is a COMPILE, not a render, so it does not need the browser: an
// authenticated HTTP request compiles the same route. Nineteen of them in
// parallel replaced nineteen sequential navigations.
{
  const cookie = await s.eval(`document.cookie`);
  await Promise.all(
    PATHS.map((p) => fetch(`${BASE}${p}`, { headers: { cookie } }).catch(() => null)),
  );
}

/**
 * What "loaded" means, per screen.
 *
 * The old readiness probe looked for a table row, a mobile card or a plans
 * card — so on the six screens that have none of those (/finance, /analytics,
 * /cron, /master-data and friends) it never matched and burned its full 20 s
 * ceiling, three times each. That was most of this script's runtime and it was
 * waiting for something that was never going to appear. Each screen now waits
 * for the thing IT actually renders, and the ceiling is short because the
 * routes are already compiled.
 */
const rowsOrCards = (band) =>
  band === "mobile"
    ? `document.querySelectorAll('main [class*="md:hidden"] > div').length > 0`
    : `document.querySelectorAll('main table tbody tr').length > 0`;

const textPresent = (re) =>
  `[...document.querySelectorAll('main div')].some((e) => ${re}.test(e.textContent.trim()))`;

const readyExpr = (path, band) => {
  switch (path) {
    case "/users":
    case "/listings":
    case "/payments":
    case "/coupons":
    case "/grants":
      return rowsOrCards(band);
    case "/plans":
      return `document.querySelectorAll('main [class*="md:grid-cols-2"] > div').length > 0`;
    case "/master-data":
      return `!!document.querySelector('main [class*="md:grid-cols-[320px_1fr]"], main [class*="md:grid-cols-[240px_1fr]"]')`;
    case "/cron":
      return `!!document.querySelector('main [class*="md:grid-cols-4"] > div')`;
    case "/analytics":
      return textPresent(`/^(Signups|Plan purchased|Listing submitted|Lead received)$/`);
    case "/finance":
      return textPresent(`/^(Total revenue|Transactions|Avg order value|Refunds)$/`);
    case "/audit":
      // A26 is expandable rows, not a table: each entry is the grid of
      // template 2586, and its rounded container is an inline style rather
      // than a class — which is why the first version of this probe said
      // "never painted" over fifty rows that were on screen.
      return `document.querySelectorAll('main [class*="grid-cols-1"]').length > 0`;
    default:
      return `document.querySelectorAll('main table tbody tr').length > 0`;
  }
};

/**
 * Open a screen through the app's OWN router.
 *
 * A `Page.navigate` re-downloads and re-parses the whole dev bundle — about
 * six seconds a screen, times fifty-seven screens. A client-side push keeps
 * the document and costs what the data costs.
 */
async function open(s, path, ready) {
  const pushed = await s.eval(
    `(() => { if (!window.next?.router?.push) return false; window.next.router.push(${JSON.stringify(path)}); return true; })()`,
  );
  if (!pushed) await s.goto(`${BASE}${path}`);
  // A12 asks for ten tab counts over a union view, and measuring mid-load is
  // exactly how P3's harness once reported an empty table as a pass. So this
  // polls for what the screen renders rather than sleeping a flat 2 s — and
  // says so when a screen never gets there, instead of silently measuring an
  // empty page.
  for (let i = 0; i < 250; i++) {
    if (await s.eval(`location.pathname === ${JSON.stringify(path)} && (${ready})`)) return true;
    await sleep(100);
  }
  return false;
}

/** everything one screen has to say, measured in whichever tab picked it up */
async function measureScreen(s, path) {
  const out = [`\n${path}`];
  const check = makeCheck(out);
  s.consoleErrors.length = 0;

  // ONE load, three bands.
  //
  // Every device branch in the admin panel is CSS — `md:hidden`,
  // `md:grid-cols-…`; there is no matchMedia and no innerWidth anywhere under
  // components/admin. Both branches are in the DOM at every width and the
  // viewport decides which one has a client rect. So the old loop reloaded
  // each of nineteen screens three times, and re-fetched every list three
  // times, to look at markup that was already there. Resizing shows the other
  // branch for free.
  await s.setViewport(1440, 900, 1, false);
  const painted = await open(s, path, readyExpr(path, "desktop"));
  if (!painted) out.push(`  --   ${path}: never painted its list — measuring anyway`);
  const loadErrors = [...s.consoleErrors];

  for (const [band, w, h] of BANDS) {
    s.consoleErrors.length = 0;
    await s.setViewport(w, h, 1, band === "mobile");
    // one frame for the reflow the resize just asked for
    await sleep(200);
    // Errors raised while loading belong to this document at every width, so
    // they count against all three bands; anything new is the resize's own.
    const bandErrors = [...loadErrors, ...s.consoleErrors];

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
        planCards: document.querySelectorAll('main [class*="md:grid-cols-2"] > div').length,
        planCols: (() => {
          const g = document.querySelector('main [class*="md:grid-cols-2"]');
          return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0;
        })(),
        // A16's "By product / By city" pair — template 1165 splits it at TABLET
        finCols: (() => {
          const g = document.querySelector('main [class*="md:grid-cols-[1.4fr_1fr]"]');
          return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0;
        })(),
        // A19's location tree and A20's FAQ sidebar are both two-column splits
        // that start at TABLET (templates 2067 and 2207), not at desktop.
        splitCols: (() => {
          const g = document.querySelector(
            'main [class*="md:grid-cols-[320px_1fr]"], main [class*="md:grid-cols-[240px_1fr]"]',
          );
          return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0;
        })(),
        // A27/A28's 4-up card grids, which halve on mobile
        gridCols: (() => {
          const g = document.querySelector('main [class*="md:grid-cols-4"]');
          return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0;
        })(),
        // A28's funnel bars (template 2646) — the tab the screen opens on
        funnelStages: [...document.querySelectorAll('main div')].filter(
          (e) => visible(e) && /^(Signups|Plan purchased|Listing submitted|Lead received)$/.test(e.textContent.trim()),
        ).length,
        // A16's KPI row is flex-wrap with minWidth:150 (template 1155), so what
        // matters is that all four are on screen and none of them is clipped
        finKpis: [...document.querySelectorAll('main div')].filter(
          (e) => visible(e) && /^(Total revenue|Transactions|Avg order value|Refunds)$/.test(e.textContent.trim()),
        ).length,
        // text the browser is cutting off inside an overflow:hidden box
        clipped: [...document.querySelectorAll('main td, main th')].filter(
          (e) => visible(e) && e.scrollWidth > e.clientWidth + 2 &&
                 getComputedStyle(e).overflow === 'hidden',
        ).length,
      };
    })()`);

    check(`${path} ${band} · no horizontal page scroll`, m.scrollW <= m.innerW + 1, true);
    check(`${path} ${band} · no clipped cell`, m.clipped, 0);
    check(`${path} ${band} · no console errors`, bandErrors.length, 0);
    if (bandErrors.length) out.push(`        ${bandErrors[0]?.slice(0, 400)}`);

    // A13 is a CARD GRID at every band (template 1216) — one column on mobile,
    // two above it. There is no table and no column drop to assert, so it is
    // checked for scroll, clipping and console errors only.
    if (path === "/plans") {
      check(`/plans ${band} · cards rendered`, m.planCards > 0, true);
      check(
        `/plans ${band} · ${band === "mobile" ? "one" : "two"} column(s)`,
        m.planCols,
        band === "mobile" ? 1 : 2,
      );
      continue;
    }

    // A19 opens on Locations: a tree beside a detail pane, split at tablet
    // (template 2067, `mobile ? column : '320px 1fr'`).
    if (path === "/master-data") {
      check(
        `/master-data ${band} · ${band === "mobile" ? "stacked" : "two column(s)"}`,
        m.splitCols,
        band === "mobile" ? 1 : 2,
      );
      continue;
    }

    // A20 opens on Pages, which is a plain dtable at every band — the design
    // gives it no mobile card branch (template 2166), the same as the twelve
    // other table-on-mobile screens check-p13-bands.mjs found. What matters is
    // that the PAGE never scrolls sideways; the table's own box may.
    if (path === "/cms" || path === "/templates") {
      check(`${path} ${band} · table renders`, m.tables, 1);
      continue;
    }

    // A27 and A28 collapse their 4-up card grids to 2 on mobile (templates
    // 2610 and 2666). Everything else in P7 is a table the design keeps at
    // every band — the same "table on mobile, its own box scrolls" branch
    // check-p13-bands.mjs measured on twelve screens.
    // A27's health strip is a 4-up grid that halves on mobile (template 2610).
    if (path === "/cron") {
      check(
        `/cron ${band} · ${band === "mobile" ? "two" : "four"} card column(s)`,
        m.gridCols,
        band === "mobile" ? 2 : 4,
      );
      continue;
    }
    // A28 opens on FUNNEL, which is stacked bars with no card grid — the 4-up
    // grid belongs to its Content tab (template 2666). Asserting the grid here
    // asserted a tab the screen is not showing.
    if (path === "/analytics") {
      check(`/analytics ${band} · funnel rendered`, m.funnelStages > 0, true);
      continue;
    }
    if (["/settings", "/tickets", "/disputes", "/staff", "/audit", "/trash", "/exports"].includes(path)) {
      // A26 is expandable ROWS, not a table — it is checked for scroll,
      // clipping and console errors only (above).
      if (path !== "/audit") check(`${path} ${band} · table renders`, m.tables >= 1, true);
      continue;
    }

    // A16 is tabs over cards and charts, not a table. Its one viewport branch
    // is the By-product / By-city pair (template 1165, `mobile?'1fr':'1.4fr 1fr'`).
    if (path === "/finance") {
      check(`/finance ${band} · all four KPIs on screen`, m.finKpis, 4);
      check(
        `/finance ${band} · ${band === "mobile" ? "one" : "two"} column(s)`,
        m.finCols,
        band === "mobile" ? 1 : 2,
      );
      continue;
    }

    if (path === "/payments") {
      if (band === "mobile") {
        check(`/payments mobile · card list, no table`, m.tables, 0);
        check(`/payments mobile · cards rendered`, m.cards > 0, true);
      } else {
        check(`/payments ${band} · table renders`, m.tables, 1);
        // template 1137 drops Method and Date on tablet: 8 → 6
        check(`/payments ${band} · visible columns`, m.columns, band === "tablet" ? 6 : 8);
      }
      continue;
    }

    if (path === "/coupons" || path === "/grants") {
      if (band === "mobile") {
        check(`${path} mobile · card list, no table`, m.tables, 0);
        check(`${path} mobile · cards rendered`, m.cards > 0, true);
      } else {
        check(`${path} ${band} · table renders`, m.tables, 1);
        // A14 drops 3 columns on tablet (9 → 6), A15 drops 3 (8 → 5)
        const want = path === "/coupons" ? (band === "tablet" ? 6 : 9) : band === "tablet" ? 5 : 8;
        check(`${path} ${band} · visible columns`, m.columns, want);
      }
      continue;
    }

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

  return out;
}

/**
 * One tab, in order.
 *
 * Four parallel tabs were tried — the screens are independent and most of the
 * wall clock is a list endpoint. It does not work: a backgrounded target in
 * headless Chrome stops laying out, so every screen but the fronted one
 * measured as a page that never painted, and forcing focus emulation on all
 * four made it worse rather than better. The speed came from loading each
 * screen once instead of three times, not from doing them at the same time.
 */
const spent = [];
for (const path of PATHS) {
  const t0 = Date.now();
  for (const line of await measureScreen(s, path)) console.log(line);
  spent.push([path, Date.now() - t0]);
}

// What is left of the runtime is the app, not the harness — print the worst
// offenders so a screen that gets slower is visible instead of just felt.
spent.sort((a, b) => b[1] - a[1]);
console.log(
  `\nslowest: ${spent
    .slice(0, 3)
    .map(([p, ms]) => `${p} ${(ms / 1000).toFixed(1)}s`)
    .join(" · ")} — total ${(spent.reduce((n, [, ms]) => n + ms, 0) / 1000).toFixed(0)}s`,
);

await s.close();
chrome.proc.kill();
console.log(
  failures === 0
    ? "\nPASS — no horizontal page scroll, no clipped text, no console errors, every device branch present\n"
    : `\nFAIL — ${failures} problem(s)\n`,
);
process.exit(failures ? 1 : 0);

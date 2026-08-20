/**
 * Shell geometry — the mobile-diff proof.
 *
 *   OUT=.shell-geo-before.json node scripts/shell-geometry.mjs
 *   OUT=.shell-geo-after.json  node scripts/shell-geometry.mjs
 *   node scripts/shell-geometry.mjs --diff .shell-geo-before.json .shell-geo-after.json
 *
 * A pixel diff of the live app cannot prove "mobile unchanged": the screens read
 * real rows, so two runs of the SAME code differ by more pixels than the change
 * does. This measures the shell instead — every element's box and the layout
 * properties that decide it — which is deterministic run to run.
 *
 * Default width is 390 (the mobile check). WIDTH=1440 shows the desktop shell.
 */
import fs from "node:fs";
import { launch, newPage } from "./lib/cdp.mjs";
import { makeClient } from "./lib/session.mjs";

const PORT = process.env.PORT ?? "3000";
const WIDTH = Number(process.env.WIDTH ?? 390);
const HEIGHT = Number(process.env.HEIGHT ?? 844);
const HOST = { public: `http://localhost:${PORT}`, seller: `http://seller.localhost:${PORT}` };
const OWNER = "+919999000004";

const ROUTES = ["/dashboard", "/listings", "/leads", "/saved", "/settings", "/plans/my", "/", "/search"];

if (process.argv[2] === "--diff") {
  const [a, b] = process.argv.slice(3).map((p) => JSON.parse(fs.readFileSync(p, "utf8")));
  let bad = 0;
  for (const route of Object.keys(a)) {
    const sa = JSON.stringify(a[route], null, 1), sb = JSON.stringify(b[route], null, 1);
    if (sa === sb) { console.log(`  ZERO  ${route}`); continue; }
    bad++;
    console.log(`  DIFF  ${route}`);
    const la = sa.split("\n"), lb = sb.split("\n");
    for (let i = 0; i < Math.max(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) console.log(`        - ${la[i] ?? "—"}\n        + ${lb[i] ?? "—"}`);
    }
  }
  console.log(bad ? `\n${bad} route(s) differ` : `\nzero geometry diff across ${Object.keys(a).length} routes`);
  process.exit(bad ? 1 : 0);
}

/** The shell's own boxes — everything AppShell/Header/BottomNav lay out. */
const PROBE = `(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      display: c.display, flexDirection: c.flexDirection, maxWidth: c.maxWidth,
      overflow: c.overflow, position: c.position, background: c.backgroundColor,
    };
  };
  const nav = document.querySelector('nav[aria-label="Primary"]');
  const side = document.querySelector('aside[aria-label="Sections"]');
  const main = document.querySelector("main");
  const header = document.querySelector("header");
  return {
    viewport: { w: innerWidth, h: innerHeight },
    // The shell root is whatever <main>'s chain hangs off <body>.
    shell: box(document.body.firstElementChild?.querySelector?.("main") ? document.body.firstElementChild : main?.closest("body > *")),
    header: box(header),
    main: box(main),
    bottomNav: box(nav),
    sideNav: box(side),
    // Nothing may scroll sideways on any width.
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    bodyScrollWidth: document.documentElement.scrollWidth,
  };
})()`;

const browser = await launch();
const page = await newPage(browser, "about:blank");
try {
  const s = await makeClient(HOST.public).session(OWNER);
  await page.send("Network.clearBrowserCookies");
  const cookies = [];
  for (const [name, value] of s.jar) {
    for (const domain of ["localhost", "seller.localhost"]) {
      cookies.push({ name, value, domain, path: "/", httpOnly: true, secure: false, sameSite: "Lax" });
    }
  }
  await page.send("Network.setCookies", { cookies });
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 768,
  });

  const out = {};
  for (const r of ROUTES) {
    await page.goto(HOST.seller + r, { waitMs: 1200 });
    out[r] = await page.eval(PROBE);
    console.log(`  ${WIDTH}  ${r}${out[r].horizontalOverflow ? "   ⚠ HORIZONTAL OVERFLOW" : ""}`);
  }
  const file = process.env.OUT ?? `.shell-geo-${WIDTH}.json`;
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\n→ ${file}`);
} finally {
  await browser.close();
}

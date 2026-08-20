/**
 * Shell check — the same routes at 390 / 768 / 1024 / 1440, as PNGs.
 *
 *   node scripts/shot-shell.mjs                  # → _screens/shell
 *   OUT=_screens/shell-before node scripts/shot-shell.mjs
 *   WIDTHS=390 node scripts/shot-shell.mjs
 *
 * Purpose: prove the desktop/tablet shell (designs/desktop-tablet/01-shell.html)
 * appears at 768+ AND that 390 is unchanged — run it once with the shell change
 * stashed (OUT=…-before) and once with it applied, then diff the 390 pair.
 *
 * Reuses the existing capture machinery: scripts/lib/cdp.mjs (real headless
 * Chrome) and scripts/lib/session.mjs (the cached QA session jar, so no OTP is
 * spent). No new endpoint, no new query.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, newPage } from "./lib/cdp.mjs";
import { makeClient } from "./lib/session.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT ?? "3000";
const OUT = path.join(ROOT, process.env.OUT ?? path.join("_screens", "shell"));
const HOST = { public: `http://localhost:${PORT}`, seller: `http://seller.localhost:${PORT}` };
const OWNER = "+919999000004"; // Sneha Patel — 62 listings (same actor as shot-screens)

const WIDTHS = (process.env.WIDTHS ?? "390,768,1024,1440").split(",").map(Number);
const HEIGHT = { 390: 844, 768: 1024, 1024: 768, 1440: 900 };

/** Console chrome (sidebar) + one browse route, all on the seller host. */
const SCREENS = [
  ["dashboard", `${HOST.seller}/dashboard`],
  ["listings", `${HOST.seller}/listings`],
  ["leads", `${HOST.seller}/leads`],
  ["saved", `${HOST.seller}/saved`],
  ["settings", `${HOST.seller}/settings`],
  ["plans-my", `${HOST.seller}/plans/my`],
  ["feed", `${HOST.seller}/`],
  ["search", `${HOST.seller}/search`],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cookies(page) {
  const s = await makeClient(HOST.public).session(OWNER);
  await page.send("Network.clearBrowserCookies");
  const list = [];
  for (const [name, value] of s.jar) {
    for (const domain of ["localhost", "seller.localhost"]) {
      list.push({ name, value, domain, path: "/", httpOnly: true, secure: false, sameSite: "Lax" });
    }
  }
  await page.send("Network.setCookies", { cookies: list });
  return s.user;
}

/** `next dev`'s own badge and toast sit on top of the app — never in a shot. */
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

const browser = await launch();
const page = await newPage(browser, "about:blank");

try {
  const user = await cookies(page);
  console.log(`logged in as ${user.name} (${user.role})`);

  for (const w of WIDTHS) {
    const h = HEIGHT[w] ?? 900;
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: w, height: h, deviceScaleFactor: 1, mobile: w < 768,
    });
    for (const [id, url] of SCREENS) {
      await page.goto(url, { waitMs: 1400 });
      await hideDevOverlay(page);
      await sleep(900); // counts land after hydration (/api/v1/dashboard)
      const file = path.join(OUT, `${w}`, `${id}.png`);
      await page.screenshot(file);
      const errs = page.consoleErrors().length;
      console.log(`  ${w}  ${id}${errs ? `   ⚠ ${errs} console errors` : ""}`);
    }
  }
} finally {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\n→ ${OUT}`);
  await browser.close();
}

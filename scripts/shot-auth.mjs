/**
 * The entry flow at 390 / 768 / 1024 / 1440 — login, OTP, role, details.
 *
 *   PORT=3000 node scripts/shot-auth.mjs        → _screens/auth/<width>/<id>.png
 *
 * AuthFlow is client-state driven (splash → login → otp → role → details are all
 * one URL), so the only way to photograph a step is to walk it the way a person
 * does — the same technique scripts/shot-screens.list.mjs uses.
 *
 * Role and Details only exist for a first-time number, so the walk uses a
 * never-seen one and STOPS before registering: nothing is written to the DB.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, newPage } from "./lib/cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, process.env.OUT ?? path.join("_screens", "auth"));
const PORT = process.env.PORT ?? "3000";
const BASE = `http://seller.localhost:${PORT}`;
const WIDTHS = (process.env.WIDTHS ?? "390,768,1024,1440").split(",").map(Number);
const HEIGHT = { 390: 844, 768: 1024, 1024: 768, 1440: 900 };

/** A number nobody has used — so the flow branches to Role + Details. */
// Pass NUMBER= to pin it, so a before/after pair renders the same masked digits
// on the OTP screen and the diff is layout only. The walk never registers, so a
// pinned number stays "new" run after run.
const NEW_NUMBER = process.env.NUMBER ?? "9" + String(Date.now()).slice(-9);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await page.send("Network.clearBrowserCookies");
  for (const w of WIDTHS) {
    const dir = path.join(OUT, String(w));
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: w, height: HEIGHT[w] ?? 900, deviceScaleFactor: 1, mobile: w < 768,
    });

    // `hz-onboarded` decides onboarding-vs-login; set it so the walk starts on
    // the login screen rather than the slide carousel.
    await page.goto(`${BASE}/login`, { waitMs: 900 });
    await page.eval(`(() => { try { localStorage.clear(); localStorage.setItem("hz-onboarded", "1"); } catch {} return true; })()`);
    await page.goto(`${BASE}/login`, { waitMs: 1500 });
    await hideDevOverlay(page);
    await sleep(600);
    await page.screenshot(path.join(dir, "01-login.png"));

    await page.typeInto("#phone", NEW_NUMBER);
    await sleep(300);
    await page.clickText("Continue");
    await sleep(1600);
    await hideDevOverlay(page);
    await page.screenshot(path.join(dir, "02-otp.png"));

    // The dev OTP is printed into the page's own console by Otp.tsx; the flow
    // hands it down as `devCode`, so typing it here spends no real SMS.
    const code = await page.eval(`(() => {
      const inputs = [...document.querySelectorAll('input[inputmode="numeric"]')];
      return inputs.length === 6 ? "ok" : "no-otp-screen";
    })()`);
    if (code !== "ok") { console.log(`  ${w}  ⚠ OTP screen not reached — stopping this width`); continue; }

    for (const [i, ch] of [..."123456"].entries()) {
      await page.eval(`(() => { const el = document.querySelectorAll('input[inputmode="numeric"]')[${i}]; el && el.focus(); return true; })()`);
      await page.send("Input.dispatchKeyEvent", { type: "keyDown", text: ch });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp" });
      await sleep(120);
    }
    await sleep(400);
    await page.clickText("Verify");
    await sleep(2200);
    await hideDevOverlay(page);
    await page.screenshot(path.join(dir, "03-role.png"));

    await page.clickText("Owner");
    await sleep(400);
    await page.clickText("Continue");
    await sleep(1500);
    await hideDevOverlay(page);
    await page.screenshot(path.join(dir, "04-details.png"));

    const errs = page.consoleErrors().length;
    console.log(`  ${w}  login → otp → role → details${errs ? `   ⚠ ${errs} console errors` : ""}`);
  }
} finally {
  console.log(`\n→ ${OUT}   (walked with ${NEW_NUMBER}, stopped before register)`);
  await browser.close();
}

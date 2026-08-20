/**
 * The entry flow as a desktop popup, walked end to end in a real browser.
 *
 *   PORT=3000 node scripts/check-login-popup.mjs
 *
 * Asserts what designs/desktop-tablet/02-auth-entry.html promises, and the two
 * things that are easy to break while delivering it:
 *   1. at 1440 `/login` is a dimmed page with a centred card and a working ✕,
 *   2. at 390 it is the untouched full-bleed screen — no dim, no card, no ✕,
 *   3. a guest CTA on the public host still hands off to the SELLER host's
 *      /login with `?next=` intact (the session may only be minted there),
 *   4. signing in through it actually lands a session, with no redirect loop.
 */
import { launch, newPage } from "./lib/cdp.mjs";

const PORT = process.env.PORT ?? "3000";
const PUBLIC = `http://localhost:${PORT}`;
const SELLER = `http://seller.localhost:${PORT}`;
const PHONE = process.env.PHONE ?? "9999000007";
const CODE = process.env.CODE ?? "123456";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `   ${detail}` : ""}`);
  if (!ok) failures++;
};

const CARD = `(() => {
  const el = document.querySelector("input#phone");
  if (!el) return null;
  const card = el.closest("div[class*='max-w-']") || el.parentElement;
  const host = card && card.parentElement;
  const cr = card.getBoundingClientRect();
  const hs = host && getComputedStyle(host);
  return {
    w: Math.round(cr.width),
    centred: Math.abs((cr.left + cr.width / 2) - innerWidth / 2) < 12,
    dim: hs ? hs.backgroundColor : null,
    radius: getComputedStyle(card).borderTopLeftRadius,
    closeBtn: !!(card.querySelector('[aria-label="Close"]') &&
      getComputedStyle(card.querySelector('[aria-label="Close"]')).display !== "none"),
    title: document.body.innerText.includes("Log in or sign up"),
  };
})()`;

async function type(page, selector, value) {
  await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.focus(); return !!el; })()`);
  for (const ch of value) {
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", text: ch });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp" });
    await sleep(60);
  }
}

async function onboarded(page, base) {
  await page.goto(`${base}/login`, { waitMs: 800 });
  await page.eval(`(() => { try { localStorage.clear(); localStorage.setItem("hz-onboarded", "1"); } catch {} return true; })()`);
}

const browser = await launch();
const page = await newPage(browser, "about:blank");

try {
  // ── 1 · desktop: /login is a popup ────────────────────────────────────────
  await page.send("Network.clearBrowserCookies");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await onboarded(page, SELLER);
  await page.goto(`${SELLER}/login`, { waitMs: 2200 });
  await page.waitFor(`!!document.querySelector("input#phone")`, { tries: 40, gap: 400 });

  const desktop = await page.eval(CARD);
  check(desktop?.w === 420, "1440: the card is 420 wide", `w=${desktop?.w}`);
  check(desktop?.centred === true, "1440: the card is centred");
  check(/rgba\(0, 0, 0, 0\.45\)/.test(desktop?.dim ?? ""), "1440: the page behind is dimmed", desktop?.dim ?? "");
  check(desktop?.closeBtn === true, "1440: the ✕ is shown");
  check(desktop?.title === true, "1440: the desktop-only title is shown");
  check(
    (await page.eval(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`)) === true,
    "1440: nothing scrolls sideways",
  );

  // ── 2 · mobile: untouched ─────────────────────────────────────────────────
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.goto(`${SELLER}/login`, { waitMs: 2200 });
  await page.waitFor(`!!document.querySelector("input#phone")`, { tries: 40, gap: 400 });
  const mobile = await page.eval(CARD);
  check(mobile?.w === 390, "390: full-bleed, no card", `w=${mobile?.w}`);
  check(!/rgba\(0, 0, 0, 0\.45\)/.test(mobile?.dim ?? ""), "390: no dim", mobile?.dim ?? "");
  check(mobile?.closeBtn === false, "390: no ✕");
  check(mobile?.title === false, "390: no desktop title");

  // ── 3 · the public host still hands off to the seller host ────────────────
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.send("Network.clearBrowserCookies");
  await page.goto(`${PUBLIC}/`, { waitMs: 2500 });
  await page.waitFor(`[...document.querySelectorAll("a")].some(a => a.textContent.trim() === "Sign In")`, { tries: 40, gap: 400 });
  await page.clickText("Sign In");
  await sleep(3000);
  const handed = await page.eval("location.href");
  check(handed.startsWith(`${SELLER}/login`), "a guest CTA lands on the seller host's /login", handed);
  check(/next=/.test(handed), "…with ?next= intact", handed);

  // ── 4 · signing in through it works, no loop ──────────────────────────────
  await page.waitFor(`!!document.querySelector("input#phone")`, { tries: 40, gap: 400 });
  await type(page, "input#phone", PHONE);
  await sleep(300);
  await page.clickText("Continue");
  await sleep(2600);
  check((await page.eval(`document.querySelectorAll('input[inputmode="numeric"]').length`)) === 6, "OTP step reached");
  for (const [i, ch] of [...CODE].entries()) {
    await page.eval(`(() => { const el = document.querySelectorAll('input[inputmode="numeric"]')[${i}]; el && el.focus(); return true; })()`);
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", text: ch });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp" });
    await sleep(120);
  }
  await sleep(400);
  await page.clickText("Verify");
  await sleep(6000);

  const landed = await page.eval("location.href");
  const body = await page.eval("document.body.innerText");
  check(!/chrome-error|ERR_TOO_MANY_REDIRECTS/.test(landed + body), "no redirect loop", landed);
  check(!/\/login/.test(landed), "did not end back on the login screen", landed);

  const cookies = (await page.send("Network.getAllCookies")).cookies;
  const at = cookies.filter((c) => c.name === "hz_at");
  check(at.some((c) => c.domain.includes("seller")), "the session cookie is on the seller host", at.map((c) => c.domain).join(",") || "none");
  check(!at.some((c) => c.domain === "localhost"), "…and NOT on the public host", at.map((c) => c.domain).join(",") || "none");
} finally {
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

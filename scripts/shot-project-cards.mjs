/**
 * Screenshot every PROJECT card the home feed renders, as a real signed-in
 * viewer, straight out of the running dev server.
 *
 *   PORT=3000 node scripts/shot-project-cards.mjs [phone]
 *
 * Output: _shots/project-card-<n>-<slug>.png (one file per card) — the actual
 * DOM, not a mockup, so what is reviewed is what ships.
 */
import fs from "node:fs";
import { launchChrome, Session, sleep } from "./lib/cdp.mjs";
import { makeClient } from "./lib/session.mjs";

const PORT = process.env.PORT ?? "3000";
const APP = `http://localhost:${PORT}`;
const PHONE = process.argv[2] ?? "+919825000001"; // Owner Test, Rajkot
const OUT = "_shots";

const cookiesFor = (jar, domain) =>
  [...jar].map(([name, value]) => ({ name, value, domain, path: "/", httpOnly: true, secure: false }));

const FREEZE = `(() => {
  const s = document.createElement('style');
  s.textContent = '*,*::before,*::after{animation-duration:0s !important;transition-duration:0s !important}';
  document.head.appendChild(s);
  return true;
})()`;

const { session: login } = makeClient(APP);

fs.mkdirSync(OUT, { recursive: true });
const chrome = await launchChrome({ port: 9341 });
const sess = await Session.connect(chrome.wsUrl);

try {
  await sess.setViewport(Number(process.env.W ?? 390), Number(process.env.H ?? 780), 2, true);
  // DARK=1 → the same cards in the dark theme (the app follows the OS scheme
  // unless a preference was stored, see components/theme/ThemeScript).
  if (process.env.DARK === "1") {
    await sess.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  }
  const s = PHONE === "guest" ? null : await login(PHONE);
  if (s) await sess.setCookies(cookiesFor(s.jar, "localhost"));

  await sess.goto(`${APP}/`, { waitMs: 3500 });
  await sess.eval(FREEZE);

  // Wait for the feed to actually have cards (skeletons are ~420px blanks).
  for (let i = 0; i < 40 && !(await sess.eval(`document.querySelectorAll('article').length > 0`)); i++) await sleep(400);

  // `only=project` (default) or `only=all` — the property card shares the same
  // chrome now, so both need reviewing side by side.
  const ONLY = process.env.ONLY ?? "project";
  const cards = await sess.eval(`(() => {
    const out = [];
    document.querySelectorAll('article').forEach((a, i) => {
      const isProject = a.innerText.startsWith('NEW PROJECT');
      if (${JSON.stringify(ONLY)} === 'project' && !isProject) return;
      const name = a.innerText.split('\\n').find(l => l && !/^(NEW PROJECT|PROMOTED|UNDER|READY|BOOKING|FOR SALE|FOR RENT|\\d+\\/\\d+)/.test(l)) ?? String(i);
      out.push({ i, name: (isProject ? 'project-' : 'property-') + name });
    });
    return out;
  })()`);

  console.log(`viewer=${PHONE} — ${cards.length} project card(s)`);

  for (const [n, c] of cards.entries()) {
    // Park the card below the sticky header, or the clip captures the header
    // sitting on top of the cover.
    const TOP = 72;
    const box = await sess.eval(`(() => {
      const a = document.querySelectorAll('article')[${c.i}];
      const sc = a.closest('.overflow-y-auto');
      if (sc) sc.scrollTop += a.getBoundingClientRect().top - ${TOP};
      const r = a.getBoundingClientRect();
      return { x: Math.max(0, r.x), y: Math.max(0, r.y), w: r.width, h: r.height };
    })()`);
    await sleep(500);
    const { data } = await sess.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 2 },
      captureBeyondViewport: true,
    });
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const file = `${OUT}/project-card-${process.env.DARK === "1" ? "dark-" : ""}${n + 1}-${slug}.png`;
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    console.log("  →", file, `${Math.round(box.w)}×${Math.round(box.h)}`);
  }

  if (sess.consoleErrors.length) console.log("console errors:", sess.consoleErrors);
} finally {
  await sess.close().catch(() => {});
  chrome.proc.kill();
}

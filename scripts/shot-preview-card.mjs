/**
 * Screenshot the create flow's PREVIEW screen (P6 S1) — the "Feed card" tab,
 * which now renders the real feed card off the server's own card payload.
 *
 *   PORT=3000 node scripts/shot-preview-card.mjs <phone> <listingId>
 */
import fs from "node:fs";
import { launchChrome, Session, sleep } from "./lib/cdp.mjs";

const PORT = process.env.PORT ?? "3000";
const APP = `http://seller.localhost:${PORT}`;
const PHONE = process.argv[2] ?? "+919265523025";
const LISTING = process.argv[3] ?? "";
const OUT = "_shots";

fs.mkdirSync(OUT, { recursive: true });
const chrome = await launchChrome({ port: 9345 });
const sess = await Session.connect(chrome.wsUrl);

try {
  await sess.setViewport(390, 900, 2, true);
  await sess.goto(`${APP}/`, { waitMs: 1500 });

  const ip = `203.0.113.${([...PHONE].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 254) + 1}`;
  const auth = await sess.eval(`(async () => {
    const H = { 'content-type': 'application/json', 'x-forwarded-for': '${ip}' };
    const r = await fetch('/api/v1/auth/otp/request', { method:'POST', headers:H, body: JSON.stringify({ phone: '${PHONE}' }) });
    const j = await r.json(); if (!j.ok) return 'req:' + j.error.code;
    const v = await fetch('/api/v1/auth/otp/verify', { method:'POST', headers:H, body: JSON.stringify({ otpSession: j.data.otpSession, code: j.data.devCode ?? '123456' }) });
    const vj = await v.json(); return vj.ok ? 'ok' : 'ver:' + vj.error.code;
  })()`);
  console.log("auth:", auth);
  if (auth !== "ok") process.exit(1);

  await sess.goto(`${APP}/create/preview?listing=${LISTING}`, { waitMs: 5000 });
  for (let i = 0; i < 40 && !(await sess.eval(`document.querySelectorAll('article').length > 0`)); i++) await sleep(400);

  const card = await sess.eval(`(() => {
    const a = document.querySelector('article');
    return a ? a.innerText.split('\\n').slice(0, 8).join(' | ') : '(no card rendered)';
  })()`);
  console.log("card:", card);

  // Wait for the photos themselves, not just the DOM — a screenshot taken
  // while the images are still decoding shows an empty frame.
  for (let i = 0; i < 40; i++) {
    const ready = await sess.eval(`[...document.images].every((im) => !im.src || im.complete)`);
    if (ready) break;
    await sleep(300);
  }
  await sleep(600);
  fs.writeFileSync(`${OUT}/preview-card.png`, await sess.screenshot());
  console.log("  →", `${OUT}/preview-card.png`);

  // the other tab, unchanged, so the shot proves nothing else moved
  await sess.eval(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Full listing')?.click()`);
  await sleep(900);
  fs.writeFileSync(`${OUT}/preview-full.png`, await sess.screenshot());
  console.log("  →", `${OUT}/preview-full.png`);

  const errs = (sess.consoleErrors ?? []).filter((e) => !/favicon|manifest/i.test(String(e)));
  console.log("console errors:", errs.length ? errs.slice(0, 3) : "none");
} finally {
  await sess.close().catch(() => {});
  chrome.proc.kill();
}

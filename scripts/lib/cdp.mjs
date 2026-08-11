/**
 * A 100-line Chrome DevTools Protocol client, with no dependencies.
 *
 * The in-app browser pane runs its tab hidden, and Chrome FREEZES a tab that is
 * never composited: the page loads, Next's runtime boots, the flight payload is
 * consumed — and then React's scheduled hydration never gets a task slot, so
 * nothing on the screen is ever interactive. That is an artifact of the pane,
 * not of the app, but it means the pane can never answer "does the button
 * work?".
 *
 * This drives a real Chrome (headless=new, which composites) over CDP instead,
 * using Node 22's built-in WebSocket. Real hydration, real clicks, real
 * screenshots.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA ?? ""}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (c && fs.existsSync(c)) return c;
  throw new Error("no Chrome/Edge binary found");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9333, headless = true } = {}) {
  const bin = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "hz-cdp-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    // The whole point: a composited page that never gets frozen.
    ...(headless ? ["--headless=new", "--window-size=390,844", "--hide-scrollbars"] : ["--window-size=390,900"]),
    "about:blank",
  ];
  const proc = spawn(bin, args, { stdio: "ignore", detached: false });

  // Wait for the debugging endpoint.
  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  if (!version) { proc.kill(); throw new Error("Chrome did not expose a debugging port"); }

  return {
    proc,
    port,
    profile,
    version,
    async close() {
      try { await fetch(`http://127.0.0.1:${port}/json/close`); } catch { /* best effort */ }
      try { proc.kill(); } catch { /* already gone */ }
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* temp dir */ }
    },
  };
}

/** Open a tab and return a small page handle. */
export async function newPage(browser, url = "about:blank") {
  const created = await (await fetch(`http://127.0.0.1:${browser.port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
      setTimeout(() => { if (pending.delete(mid)) reject(new Error(`${method} timed out`)); }, 45_000);
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");

  const page = {
    send,
    events,
    consoleErrors: () =>
      events
        .filter((e) => e.method === "Log.entryAdded" && e.params.entry.level === "error")
        .map((e) => e.params.entry.text),
    async goto(target, { waitMs = 1200 } = {}) {
      await send("Page.navigate", { url: target });
      await sleep(waitMs);
      // Settle: wait for the document to be complete AND for React to hydrate.
      //
      // Hydration is detected by React's own fiber keys on a real DOM node, NOT
      // by __REACT_DEVTOOLS_GLOBAL_HOOK__.renderers — that hook is only
      // populated when the DevTools extension is installed, which headless
      // Chrome does not have, so it reads 0 on a perfectly hydrated page.
      for (let i = 0; i < 60; i++) {
        const r = await page.eval(`(() => {
          const el = document.querySelector("main button, main a, button, a");
          const keys = el ? Object.keys(el).filter(k => k.startsWith("__react")) : [];
          return { ready: document.readyState, hydrated: keys.length > 0, keys: keys.length };
        })()`);
        if (r?.ready === "complete" && r?.hydrated) return r;
        await sleep(250);
      }
      return page.eval(`(() => {
        const el = document.querySelector("main button, main a, button, a");
        const keys = el ? Object.keys(el).filter(k => k.startsWith("__react")) : [];
        return { ready: document.readyState, hydrated: keys.length > 0, keys: keys.length };
      })()`);
    },
    async eval(expression) {
      const r = await send("Runtime.evaluate", {
        expression: `(async () => { const v = await (${expression}); return JSON.stringify(v ?? null); })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
      try { return JSON.parse(r.result.value); } catch { return r.result.value; }
    },
    /** Click by visible text — the way a person finds a button. */
    async clickText(text, { nth = 0 } = {}) {
      const box = await page.eval(`(() => {
        const wanted = ${JSON.stringify(text)};
        const nodes = [...document.querySelectorAll("button, a, [role=button], input[type=submit]")]
          .filter(el => (el.innerText || el.value || "").trim().toLowerCase().includes(wanted.toLowerCase()));
        const el = nodes[${nth}];
        if (!el) return null;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: (el.innerText || el.value || "").trim().slice(0, 40) };
      })()`);
      if (!box) return null;
      for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
      }
      await sleep(450);
      return box.label;
    },
    /** Real mouse click on the first element matching a selector. */
    async clickSelector(selector) {
      const box = await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, href: el.getAttribute("href") ?? null };
      })()`);
      if (!box) return null;
      for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
      }
      await sleep(900);
      return box.href ?? "clicked";
    },
    async waitFor(expression, { tries = 30, gap = 300 } = {}) {
      for (let i = 0; i < tries; i++) {
        if (await page.eval(expression)) return true;
        await sleep(gap);
      }
      return false;
    },
    async typeInto(selector, value) {
      const ok = await page.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.focus();
        return true;
      })()`);
      if (!ok) return false;
      for (const ch of value) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", text: ch });
        await send("Input.dispatchKeyEvent", { type: "keyUp" });
      }
      await sleep(250);
      return true;
    },
    async text() {
      return page.eval(`(document.querySelector("main")?.innerText ?? document.body.innerText).slice(0, 4000)`);
    },
    async screenshot(file) {
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, "base64"));
      return file;
    },
    async setViewport(width, height) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
    },
    close: () => ws.close(),
  };

  return page;
}

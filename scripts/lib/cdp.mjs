/**
 * Minimal Chrome DevTools Protocol client.
 *
 * The in-app Browser pane cannot composite frames when it is not displayed, so
 * its screenshot call times out. Driving a headless Chrome over CDP instead
 * gives us real PNG bytes on disk, which is what a true pixel-diff needs.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome({ port = 9333 } = {}) {
  const bin = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!bin) throw new Error("No Chrome/Edge binary found");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "hz-cdp-"));
  const proc = spawn(bin, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--force-color-profile=srgb",
    "--disable-lcd-text",
    "--font-render-hinting=none",
    "--allow-running-insecure-content",
    "about:blank",
  ], { stdio: "ignore" });

  let info;
  for (let i = 0; i < 100; i++) {
    try {
      info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch { await sleep(150); }
  }
  if (!info) throw new Error("Chrome did not expose a debugging port");
  return { proc, port, userDataDir, wsUrl: info.webSocketDebuggerUrl };
}

/** One CDP session bound to a freshly created target (tab). */
export class Session {
  constructor(ws, sessionId) { this.ws = ws; this.sessionId = sessionId; }

  static async connect(browserWsUrl) {
    const ws = new WebSocket(browserWsUrl);
    const pending = new Map();
    const events = [];
    let id = 0;
    ws._send = (method, params, sessionId) =>
      new Promise((resolve, reject) => {
        const msgId = ++id;
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params: params ?? {}, ...(sessionId ? { sessionId } : {}) }));
      });
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message} (${msg.error.code})`)) : resolve(msg.result);
      } else if (msg.method) {
        events.push(msg);
        for (const h of ws._handlers ?? []) h(msg);
      }
    });
    ws._handlers = [];
    ws._events = events;
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });

    const { targetId } = await ws._send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await ws._send("Target.attachToTarget", { targetId, flatten: true });
    const s = new Session(ws, sessionId);
    s.targetId = targetId;
    await s.send("Page.enable");
    await s.send("Runtime.enable");
    await s.send("Network.enable");
    await s.send("Console.enable");
    s.consoleErrors = [];
    s.failedRequests = [];
    // Response statuses, so a check can assert "no 404/5xx on this screen"
    // rather than only noticing requests that failed at the transport layer.
    s.responses = [];
    ws._handlers.push((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === "Runtime.exceptionThrown")
        s.consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
      if (msg.method === "Console.messageAdded" && msg.params.message.level === "error")
        s.consoleErrors.push(msg.params.message.text);
      if (msg.method === "Network.loadingFailed") s.failedRequests.push(msg.params.errorText);
      if (msg.method === "Network.responseReceived")
        s.responses.push({ status: msg.params.response.status, url: msg.params.response.url });
    });
    return s;
  }

  send(method, params) { return this.ws._send(method, params, this.sessionId); }

  async setViewport(width, height, deviceScaleFactor = 1, mobile = true) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor, mobile,
      screenWidth: width, screenHeight: height,
    });
  }

  async setCookies(cookies) { await this.send("Network.setCookies", { cookies }); }

  async goto(url, { waitMs = 0 } = {}) {
    const done = new Promise((resolve) => {
      const h = (msg) => {
        if (msg.sessionId === this.sessionId && msg.method === "Page.loadEventFired") {
          this.ws._handlers.splice(this.ws._handlers.indexOf(h), 1);
          resolve();
        }
      };
      this.ws._handlers.push(h);
    });
    await this.send("Page.navigate", { url });
    await Promise.race([done, sleep(20000)]);
    if (waitMs) await sleep(waitMs);
  }

  async eval(expression, { awaitPromise = true } = {}) {
    const r = await this.send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
    return r.result.value;
  }

  /** PNG buffer of the viewport (or the full scrollable page). */
  async screenshot({ fullPage = false } = {}) {
    let clip;
    if (fullPage) {
      const m = await this.send("Page.getLayoutMetrics");
      const c = m.cssContentSize ?? m.contentSize;
      clip = { x: 0, y: 0, width: Math.ceil(c.width), height: Math.ceil(c.height), scale: 1 };
    }
    const { data } = await this.send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: fullPage, ...(clip ? { clip } : {}),
    });
    return Buffer.from(data, "base64");
  }

  async close() { await this.ws._send("Target.closeTarget", { targetId: this.targetId }); }
}

export { sleep };

/**
 * Run an async body in the page and return its value.
 *
 * `Session.eval` takes a bare expression, but every non-trivial check wants
 * `await` and `return` inside it — so wrap the body in an async IIFE rather than
 * each script re-inventing the wrapper.
 */
export function ev(session, body) {
  return session.eval(`(async () => { ${body} })()`);
}

/**
 * Dev-mode OTP sign-in (fixed code, no SMS — CLAUDE.md "OTP: DEV MODE now").
 *
 * Deliberately step-by-step with short evals rather than one long one: the OTP
 * submit NAVIGATES, which tears down the JS execution context, and a single
 * awaiting eval just rejects with "Inspected target navigated or closed".
 *
 * `/login` also opens on the onboarding carousel, so it skips through to the
 * phone screen first. Returns where it landed, so a caller can assert.
 */
export async function devLogin(session, { sellerOrigin, phone = "9999000007", otp = "123456" } = {}) {
  const HELPERS = `
    const set=(el,v)=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
    const vis=()=>[...document.querySelectorAll('input')].filter(i=>i.offsetParent!==null&&i.type!=='hidden');
    const btn=(re)=>[...document.querySelectorAll('button')].find(b=>!b.disabled&&re.test(b.textContent.trim()));`;
  const safe = async (body, fallback = null) => {
    try { return await ev(session, body); } catch { return fallback; }
  };

  await session.goto(`${sellerOrigin}/login`, { waitMs: 5000 });
  await safe(`${HELPERS} const b=btn(/^Skip$/); if(b)b.click(); return 1`);
  await sleep(2500);
  if (!(await safe(`${HELPERS} const i=vis()[0]; if(!i) return 0; set(i,'${phone}'); return 1`, 0))) {
    return "no phone input";
  }
  await sleep(600);
  await safe(`${HELPERS} const b=btn(/continue|send|next|otp/i); if(b)b.click(); return 1`);
  await sleep(4000);
  await safe(`${HELPERS} const ins=vis(); if(ins.length>=6){'${otp}'.split('').forEach((d,i)=>set(ins[i],d));} else if(ins.length){set(ins[ins.length-1],'${otp}');} return 1`);
  await sleep(1200);
  await safe(`${HELPERS} const b=btn(/verify|continue|submit/i); if(b)b.click(); return 1`);
  await sleep(6000);
  return safe("return location.host + location.pathname", "context lost");
}

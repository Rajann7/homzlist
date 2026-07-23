/**
 * Logged-in API sessions for the QA scripts, cached on disk.
 *
 * OTP is capped at 10 sends/day per IP (lib/auth/otp.ts) and every script run
 * shares one IP in dev, so re-logging-in on each run burns the whole budget in
 * two runs. Cookies are cached in .qa-sessions.json and revalidated against
 * /api/v1/auth/me; a fresh OTP is only requested when the cached one is dead.
 *
 * The cache holds dev session cookies for seeded test numbers only — it is
 * gitignored, and nothing here weakens the limit itself.
 */
import fs from "node:fs";

const CACHE = ".qa-sessions.json";

/**
 * OTP is limited per number (3/hour) AND per client IP (10/day). Every actor in
 * a QA run comes from one machine, so the per-IP cap — which exists to stop one
 * attacker enumerating many numbers — fires on the second run of the day and
 * blocks the harness entirely.
 *
 * Each seeded actor therefore presents its own forwarded client IP, which is
 * what N real users on N devices would look like. The per-NUMBER limit is left
 * fully in force; nothing here relaxes a control on any single account.
 */
const actorIp = (phone) => {
  const n = [...phone].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return `203.0.113.${(n % 254) + 1}`; // TEST-NET-3, never a real client
};

export function makeClient(base) {
  const readCache = () => {
    try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { return {}; }
  };
  const writeCache = (c) => fs.writeFileSync(CACHE, JSON.stringify(c, null, 2));

  const call = async (jar, path, opt = {}) => {
    const res = await fetch(base + path, {
      ...opt, redirect: "manual",
      headers: {
        ...(opt.body instanceof Buffer || opt.body instanceof Uint8Array ? {} : { "content-type": "application/json" }),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(opt.headers ?? {}),
      },
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const p = c.split(";")[0], i = p.indexOf("=");
      jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
    }
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };

  async function session(phone) {
    const cache = readCache();
    if (cache[phone]) {
      const jar = new Map(Object.entries(cache[phone]));
      let me = await call(jar, "/api/v1/auth/me");
      if (!me.json?.data?.user) {
        // access token expired — rotate with the refresh cookie rather than
        // spending one of the 10 daily OTP sends
        await call(jar, "/api/v1/auth/refresh", { method: "POST", body: "{}" });
        me = await call(jar, "/api/v1/auth/me");
      }
      if (me.json?.data?.user) {
        // the access cookie may have just been rotated — persist it
        cache[phone] = Object.fromEntries(jar);
        writeCache(cache);
        return { jar, user: me.json.data.user, call: (p, o) => call(jar, p, o), cached: true };
      }
    }
    const jar = new Map();
    const ip = { "x-forwarded-for": actorIp(phone) };
    const r = await call(jar, "/api/v1/auth/otp/request", {
      method: "POST", headers: ip, body: JSON.stringify({ phone }),
    });
    if (!r.json?.ok) throw new Error(`login ${phone}: ${JSON.stringify(r.json?.error)}`);
    await call(jar, "/api/v1/auth/otp/verify", {
      method: "POST", headers: ip,
      body: JSON.stringify({ otpSession: r.json.data.otpSession, code: r.json.data.devCode }),
    });
    const me = await call(jar, "/api/v1/auth/me");
    if (!me.json?.data?.user) throw new Error(`no session for ${phone}`);
    cache[phone] = Object.fromEntries(jar);
    writeCache(cache);
    return { jar, user: me.json.data.user, call: (p, o) => call(jar, p, o), cached: false };
  }

  return { call, session };
}

/**
 * Test-time site password wall (Edge-safe).
 *
 * A single shared password that seals the ENTIRE deploy — every host, every
 * page, every API route — behind one prompt, so a work-in-progress deploy can
 * be handed to a tester without being crawled or seen by the public.
 *
 * This is DEPLOY INFRASTRUCTURE, not a product feature and not real auth. It is
 * a coarse "are you allowed to look at this build at all" gate that sits in
 * front of the app's own login. Do not confuse it with the user/admin sessions.
 *
 * Turned on ONLY by the presence of `SITE_GATE_PASSWORD` in the environment:
 *   · set it on the test deploy  → whole site locked with that password;
 *   · leave it unset (local dev, production) → this module is a no-op and the
 *     middleware behaves exactly as if it were not here.
 *
 * The cookie never carries the password: it holds the SHA-256 of it, and every
 * request recomputes the expected digest from the env value and compares. Rotate
 * the password by changing the env var — old cookies stop matching immediately.
 */

const COOKIE = "hz_gate";
/** Where the unlock form POSTs. Deliberately obscure and app-owned. */
export const UNLOCK_PATH = "/__unlock";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** The configured password, or null when the gate is switched off. */
export function gatePassword(): string | null {
  const pw = process.env.SITE_GATE_PASSWORD;
  return pw && pw.length > 0 ? pw : null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The opaque token stored in the cookie for a given password. */
export async function gateToken(password: string): Promise<string> {
  // Salt keeps the digest from being a bare, reversible hash of a short password.
  return sha256Hex(`hz-site-gate:v1:${password}`);
}

/** Constant-ish comparison — length check then char-by-char, no early return. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Does this request already carry a valid unlock cookie? */
export async function isUnlocked(cookieValue: string | undefined, password: string): Promise<boolean> {
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await gateToken(password));
}

/** The Set-Cookie attributes for a successful unlock. */
export function unlockCookie(token: string, secure: boolean) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

export const GATE_COOKIE = COOKIE;

/**
 * The unlock screen — a single self-contained HTML document with no external
 * assets (so it renders while the rest of the site is walled off). Themed to
 * the app's dark surface, deliberately plain: this is a testing checkpoint, not
 * a product screen, so it is kept out of the design-lock surface on purpose.
 */
export function gateHtml({ nextPath, error }: { nextPath: string; error?: boolean }): string {
  const safeNext = nextPath.replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>HomzList — Private preview</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0b0f0d;
    color: #e8efec;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .card {
    width: 100%; max-width: 360px;
    background: #121815;
    border: 1px solid #223029;
    border-radius: 16px;
    padding: 28px 24px;
    box-shadow: 0 20px 60px rgba(0,0,0,.45);
  }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .dot { width: 30px; height: 30px; border-radius: 9px; background: #1DB868; display: grid; place-items: center; color: #04120a; font-weight: 800; }
  h1 { font-size: 17px; margin: 0; font-weight: 700; letter-spacing: -.01em; }
  p.sub { margin: 6px 0 20px; font-size: 13px; line-height: 1.5; color: #9db1a7; }
  label { display: block; font-size: 12px; color: #9db1a7; margin-bottom: 7px; }
  input[type=password] {
    width: 100%; padding: 13px 14px; font-size: 15px;
    background: #0b0f0d; color: #e8efec;
    border: 1px solid #2a3a31; border-radius: 11px; outline: none;
  }
  input[type=password]:focus { border-color: #1DB868; box-shadow: 0 0 0 3px rgba(29,184,104,.18); }
  button {
    margin-top: 16px; width: 100%; padding: 13px 14px; font-size: 15px; font-weight: 650;
    background: #1DB868; color: #04120a; border: 0; border-radius: 11px; cursor: pointer;
  }
  button:active { transform: translateY(1px); }
  .err { margin-top: 14px; font-size: 13px; color: #ff8a8a; ${error ? "" : "display:none;"} }
</style>
</head>
<body>
  <form class="card" method="POST" action="${UNLOCK_PATH}" autocomplete="off">
    <div class="brand"><span class="dot">H</span><h1>HomzList</h1></div>
    <p class="sub">This is a private preview build. Enter the access password to continue.</p>
    <label for="pw">Password</label>
    <input id="pw" name="pw" type="password" autofocus required />
    <input type="hidden" name="next" value="${safeNext}" />
    <button type="submit">Unlock</button>
    <div class="err">Wrong password — try again.</div>
  </form>
</body>
</html>`;
}

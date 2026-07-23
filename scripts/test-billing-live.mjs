/**
 * LIVE end-to-end proof through the real HTTP API (no DB shortcuts):
 * login by OTP → validate coupon → checkout → checkout again.
 * The second checkout with the same code must be refused by the DB slot gate.
 */
const BASE = "http://localhost:3000";

const jar = new Map();
function saveCookies(res, key) {
  const set = res.headers.getSetCookie?.() ?? [];
  const cur = jar.get(key) ?? new Map();
  for (const c of set) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    cur.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  jar.set(key, cur);
}
const cookieHeader = (key) =>
  [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

async function api(key, path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", cookie: cookieHeader(key) },
    body: body ? JSON.stringify(body) : undefined,
  });
  saveCookies(res, key);
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

async function login(phone) {
  const key = phone;
  const req = await api(key, "/api/v1/auth/otp/request", { method: "POST", body: { phone } });
  const code = req.json?.data?.devCode ?? "123456";
  const otpSession = req.json?.data?.otpSession;
  const ver = await api(key, "/api/v1/auth/otp/verify", { method: "POST", body: { otpSession, code } });
  const me = await api(key, "/api/v1/auth/me");
  const role = me.json?.data?.role ?? me.json?.data?.user?.role ?? me.json?.data?.profile?.role;
  return { key, ok: ver.status === 200 && !!role, role, reqStatus: req.status, verStatus: ver.status };
}

const CASES = [
  { phone: "+919999000006", label: "owner",   plan: "p999"  },
  { phone: "+919999000008", label: "broker",  plan: "p2999" },
  { phone: "+919999000014", label: "builder", plan: "p9999" },
];

const sessions = {};

let allPass = true;
const pass = (c, m) => { if (!c) allPass = false; console.log(`  [${c ? "PASS" : "FAIL"}] ${m}`); };

for (const c of CASES) {
  console.log(`\n=== ${c.label.toUpperCase()}  ${c.phone} ===`);
  const s = await login(c.phone);
  sessions[c.label] = s;
  pass(s.ok, `login via real OTP flow (request=${s.reqStatus} verify=${s.verStatus}) role=${s.role}`);
  if (!s.ok) continue;

  // Role gate: the builder-only ₹9,999 plan must be unbuyable by owner/broker.
  const roleProbe = await api(s.key, "/api/v1/billing/checkout", {
    method: "POST", body: { planId: "p9999", idempotencyKey: `probe-${Date.now()}` },
  });
  if (c.label === "builder") pass(roleProbe.status === 200, `builder CAN buy p9999 (${roleProbe.status})`);
  else pass(roleProbe.status === 403, `${c.label} BLOCKED from builder-only p9999 (${roleProbe.status})`);

  // Coupon validate, then two checkouts with the same code.
  const v = await api(s.key, "/api/v1/billing/coupon/validate", {
    method: "POST", body: { code: "SAVE20", planId: c.plan },
  });
  console.log(`  coupon validate → ${v.status} ${JSON.stringify(v.json?.data ?? v.json?.error ?? {})}`);

  const one = await api(s.key, "/api/v1/billing/checkout", {
    method: "POST", body: { planId: c.plan, couponCode: "SAVE20", idempotencyKey: `live-a-${c.phone}-${Date.now()}` },
  });
  const two = await api(s.key, "/api/v1/billing/checkout", {
    method: "POST", body: { planId: c.plan, couponCode: "SAVE20", idempotencyKey: `live-b-${c.phone}-${Date.now()}` },
  });
  console.log(`  checkout #1 → ${one.status}  amount=${one.json?.data?.amount}`);
  console.log(`  checkout #2 → ${two.status}  ${JSON.stringify(two.json?.error ?? {})}`);

  // The first discounted order is allowed; the second must be refused by the DB
  // slot gate, not merely by the advisory pre-check.
  pass(one.status === 200, `first discounted checkout accepted (${one.status})`);
  pass(two.status === 422 && two.json?.error?.couponError === "USED",
       `second discounted checkout refused as USED (${two.status})`);

  // Unauthenticated sweep on the same endpoints.
  const anonCheckout = await fetch(BASE + "/api/v1/billing/checkout", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId: c.plan }),
  });
  pass(anonCheckout.status === 401, `anonymous checkout rejected (${anonCheckout.status})`);
}

// IDOR: one user must not read another user's order.
console.log(`\n=== IDOR probe ===`);
const a = sessions.owner;
const b = sessions.broker;
const mk = a && b ? await api(a.key, "/api/v1/billing/checkout", {
  method: "POST", body: { planId: "p999", idempotencyKey: `idor-${Date.now()}` },
}) : { json: null };
const victimOrder = mk.json?.data?.orderId;
if (victimOrder) {
  const steal = await api(b.key, `/api/v1/billing/payments?orderId=${victimOrder}`);
  const stolen = JSON.stringify(steal.json ?? {}).includes(victimOrder);
  pass(!stolen, `broker cannot read owner's order ${victimOrder.slice(0, 8)}… (${steal.status})`);
} else {
  console.log("  (could not create probe order)");
}

// Leave the DB as we found it: these probes create real unpaid orders, and their
// held coupon slots would otherwise block the next run for 30 minutes.
{
  const fs = await import("node:fs");
  const pg = (await import("pg")).default;
  const E = {};
  for (const l of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
    if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const c = new pg.Client({
    host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
    password: E.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(
    `delete from orders
      where status in ('created','pending')
        and (idempotency_key like 'live-%' or idempotency_key like 'probe-%' or idempotency_key like 'idor-%')
      returning id`);
  console.log(`\ncleanup: removed ${r.rowCount} unpaid probe orders (held claims cascade)`);
  await c.end();
}

console.log(`\n${allPass ? "ALL LIVE CHECKS PASS" : "SOME LIVE CHECKS FAILED"}`);
process.exit(allPass ? 0 : 1);

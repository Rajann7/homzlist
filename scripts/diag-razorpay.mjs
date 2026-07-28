/**
 * Diagnostic: is the Razorpay integration actually usable right now?
 * Prints STATUS and error descriptions only — never key material.
 */
import { env } from "./lib/dbx.mjs";

const id = (env.RAZORPAY_KEY_ID ?? "").trim();
const secret = (env.RAZORPAY_KEY_SECRET ?? "").trim();
const hook = (env.RAZORPAY_WEBHOOK_SECRET ?? "").trim();

console.log("=== env shape (no values) ===");
console.log(`  RAZORPAY_KEY_ID        len=${id.length} mode=${id.startsWith("rzp_test_") ? "TEST" : id.startsWith("rzp_live_") ? "LIVE" : "UNRECOGNISED/EMPTY"}`);
console.log(`  RAZORPAY_KEY_SECRET    len=${secret.length}`);
console.log(`  RAZORPAY_WEBHOOK_SECRET len=${hook.length}`);
console.log(`  isConfigured() would be: ${Boolean(id && secret)}`);

if (!id || !secret) {
  console.log("\n→ Keys missing: the app falls back to the SIMULATED dev path.");
  process.exit(0);
}

const auth = "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");

console.log("\n=== live call: POST /v1/orders (₹1 probe) ===");
const res = await fetch("https://api.razorpay.com/v1/orders", {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify({
    amount: 100, currency: "INR",
    receipt: `diag_${Date.now()}`, payment_capture: 1,
    notes: { diag: "credential check" },
  }),
});
const json = await res.json().catch(() => null);
console.log(`  HTTP ${res.status}`);
if (res.ok) {
  console.log(`  order created: ${json.id} status=${json.status} amount=${json.amount}`);
  console.log("  → credentials are VALID and orders can be created.");
} else {
  console.log("  error:", JSON.stringify(json?.error ?? json));
  const d = json?.error?.description ?? "";
  if (res.status === 401) console.log("  → key id/secret rejected by Razorpay (wrong, rotated, or test/live mismatch).");
  else if (/not activated|activate/i.test(d)) console.log("  → account not activated for this mode.");
}

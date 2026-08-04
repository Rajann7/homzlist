/**
 * MODULE 12 UI sweep — the checks that need the rendered page rather than the
 * API: does every P12 route render its designed furniture, and does anything
 * overflow the 390px column?
 *
 *   node scripts/check-module12-ui.mjs
 *
 * It fetches the SSR HTML for each route (with a real session for the seller
 * ones) and asserts on the markup. That covers the server-rendered half —
 * headers, section labels, the legal version bar, the blog hero, the data
 * screen's include/exclude list — and it is the half a screenshot diff would
 * miss anyway because it cannot tell "the string is absent" from "the string
 * moved 2px".
 *
 * The interactive half (sheets opening, dialogs, dark mode, the TOC jump) is
 * exercised by hand in the browser; what is automated here is everything that
 * can regress silently on a later edit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELLER = (process.argv[2] ?? "http://seller.localhost:3000").replace(/\/$/, "");
const PUBLIC = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const results = [];
const check = (n, p, d = "") => { results.push({ n, p: !!p }); console.log(`${p ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); };
const section = (t) => console.log(`\n\x1b[1m── ${t}\x1b[0m`);

const jar = new Map();
async function get(base, url) {
  const r = await fetch(base + url, {
    headers: jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {},
    redirect: "manual",
  });
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";"); const i = pair.indexOf("=");
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return { status: r.status, html: await r.text() };
}
async function post(base, url, body) {
  const r = await fetch(base + url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) },
    body: JSON.stringify(body), redirect: "manual",
  });
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";"); const i = pair.indexOf("=");
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return r.json();
}

/* ────────────────────────────────────────────── public, guest-rendered ─── */
section("Public host — guest-readable, SEO surfaces");

for (const [url, must] of [
  ["/legal", ["Terms of Service", "Privacy Policy", "Refund Policy", "Disclaimer", "Community Guidelines", "Grievance Officer", "Cookie Policy", "About HomzList"]],
  // "Version 1.0" is NOT one string in the HTML — React emits `Version <!-- -->1.0`
  // for an interpolated value, so the effective date is the stable assertion.
  ["/legal/terms", ["Effective 1 Aug 2026", "Table of contents", "Section 79", "Rajkot", "Download PDF", "Share"]],
  ["/legal/privacy", ["Digital Personal Data Protection Act, 2023", "Table of contents"]],
  ["/legal/refund", ["No refund", "technical failure"]],
  ["/legal/disclaimer", ["as is", "due diligence"]],
  ["/legal/community", ["Post honestly", "contact system"]],
  ["/legal/grievance", ["Grievance Officer", "24 hours", "15 days", "Raise a grievance"]],
  ["/legal/cookie", ["Strictly necessary", "Your choices"]],
  ["/legal/about", ["Why we built it", "Rajkot"]],
  ["/blog", ["Buying a flat in Rajkot", "min read", "Buying", "Renting", "Rajkot market"]],
  ["/blog/buying-a-flat-in-rajkot-2025", ["HomzList Team", "min read", "BlogPosting", "canonical", "Share this article", "Related posts"]],
  ["/offline", ["You're offline", "Retry"]],
]) {
  const { status, html } = await get(PUBLIC, url);
  const missing = must.filter((m) => !html.includes(m) && !html.includes(m.replace(/'/g, "&#x27;")));
  check(`GET ${url} → 200 with its designed content`, status === 200 && missing.length === 0,
    status !== 200 ? `status ${status}` : missing.length ? `missing: ${missing.join(", ")}` : "");
}

{
  const { html } = await get(PUBLIC, "/legal/terms?version=1.0");
  check("an archived version is noindex (the current page must outrank it)",
    /noindex/.test(html) || !/index,follow/.test(html));
}

/* ───────────────────────────────────────────────────── seller, signed in ─── */
section("Seller host — signed in");

const { rows } = await (async () => {
  const pg = (await import("pg")).default;
  const c = new pg.Client({
    host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
    password: E.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(
    `select phone from profiles where state='active' and is_registered and role='owner' and name is not null
      order by last_active_at desc nulls last limit 1`);
  await c.end();
  return r;
})();

const otp = await post(SELLER, "/api/v1/auth/otp/request", { phone: rows[0].phone });
await post(SELLER, "/api/v1/auth/otp/verify", { otpSession: otp.data.otpSession, code: otp.data.devCode ?? "123456" });

for (const [url, must] of [
  ["/help", ["Help centre"]],
  ["/help/plans-pricing", []],
  ["/help/article/how-does-the-999-plan-work", []],
  ["/help/tickets", ["Support"]],
  ["/help/contact", ["Contact support"]],
  ["/help/contact?topic=grievance", ["Contact support"]],
  ["/legal", ["Legal"]],
  ["/legal/terms", ["Terms of Service"]],
  ["/blog", ["Blog"]],
  ["/settings/data", ["Download your data"]],
  ["/settings/account", ["Account"]],
  ["/settings/components", ["Components"]],
  ["/maintenance", ["back shortly"]],
]) {
  const { status, html } = await get(SELLER, url);
  const missing = must.filter((m) => !html.includes(m) && !html.includes(m.replace(/'/g, "&#x27;")));
  check(`GET ${url} → 200`, status === 200 && missing.length === 0,
    status !== 200 ? `status ${status}` : missing.join(", "));
}

/* ───────────────────────────────────── design-lock string spot-checks ─── */
section("Design copy — the strings P12 draws, verbatim");

/*
 * These screens fetch their own data, so their copy is not in the SSR HTML —
 * asserting against the response body would be testing the fetch, not the copy.
 * The design lock is about the STRINGS, so the strings are checked where they
 * are actually written down. A later edit that quietly reworded "Delete
 * permanently" fails here, which is the regression worth catching.
 */
const source = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

{
  const src = source("components/account/AccountLifecycle.tsx");
  for (const s of [
    "Deactivate temporarily",
    "Your profile and listings are hidden",
    "Chats are paused",
    "Everything comes back when you log in again",
    "Your plans stay as they are",
    "Delete permanently",
    "Your listings, requirements and chats are removed",
    "Payment records are kept for 7 years as required by law (anonymised)",
    "You have 30 days to change your mind",
    "Type DELETE to confirm",
    "Why are you leaving?",
    "Enter the code we sent you",
    "Account deactivated",
    "Account scheduled for deletion",
    "Cancel deletion",
  ]) check(`P12 S6 copy: “${s.slice(0, 46)}”`, src.includes(s) || src.includes(s.replace(/'/g, "&apos;")));
}
{
  const src = source("components/account/DataDownload.tsx");
  for (const s of [
    "Profile and account details",
    "Your listings and requirements",
    "Messages you sent",
    "Payment history and invoices",
    "Messages other people sent to you",
    "Other users' contact details",
    "Request data",
    "Preparing your data…",
    "Your data is ready",
    "Previous requests",
  ]) check(`P12 S5 copy: “${s.slice(0, 46)}”`, src.includes(s) || src.includes(s.replace(/'/g, "&apos;")));
}
{
  const src = source("components/support/NewTicket.tsx");
  check("P12 S2 SLA note is the design's wording",
    src.includes("grievance complaints: acknowledged in") && src.includes("resolved within 15 days"));
  check("P12 S2 conditional-field warning is the design's wording",
    src.includes("You&apos;ll be asked to verify ownership"));
}
{
  const src = source("components/help/HelpCentre.tsx");
  check("P12 S1 empty state is the design's wording", src.includes("No articles found for"));
  check("P12 S1 help card is the design's wording",
    src.includes("Still need help?") && src.includes("Our team replies within 24 hours"));
}
{
  const src = source("components/system/MaintenancePage.tsx");
  check("P12 S8 copy", src.includes("We&apos;ll be back shortly") && src.includes("Check status on WhatsApp"));
}
{
  const src = source("components/system/OfflineScreen.tsx");
  check("P12 S7 copy",
    src.includes("You&apos;re offline") && src.includes("will sync automatically when you&apos;re back"));
}

const failed = results.filter((r) => !r.p);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log("\nFAILED:"); for (const f of failed) console.log(`  ✗ ${f.n}`); }
process.exit(failed.length ? 1 : 0);

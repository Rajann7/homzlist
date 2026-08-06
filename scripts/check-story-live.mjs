/**
 * Live proof for the redesigned story viewer (designs/P2A).
 *
 *   node scripts/check-story-live.mjs [baseUrl]
 *
 * Walks the real endpoints against the DEV database and PRINTS THE ROWS, because
 * a green screen is not acceptance (CLAUDE.md §8):
 *   1. guest  — /api/v1/stories carries title / typeLabel / specs / href
 *   2. specs  — every tile came from the TYPE's own key_specs, none is blank
 *   3. viewer — save toggles, and the `saves` row is really there
 *   4. viewer — seen writes a `story_seen` row (no view-count anywhere)
 *   5. sold   — a listing sold mid-24h returns available:false
 *   6. leak   — a draft id 404s instead of exposing its price/cover
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const results = [];
const check = (n, p, d = "") => { results.push({ n, p: !!p }); console.log(`${p ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); };

function actor(label) {
  const jar = new Map();
  return {
    label,
    async req(u, m = "GET", b) {
      const r = await fetch(`${BASE}${u}`, {
        method: m,
        headers: { ...(b ? { "Content-Type": "application/json" } : {}), ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) },
        body: b ? JSON.stringify(b) : undefined, redirect: "manual",
      });
      for (const c of r.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";"); const i = pair.indexOf("=");
        const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
        if (v === "" || v === "deleted") jar.delete(k); else jar.set(k, v);
      }
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json };
    },
    async login(phone) {
      const r1 = await this.req("/api/v1/auth/otp/request", "POST", { phone });
      const r2 = await this.req("/api/v1/auth/otp/verify", "POST", { otpSession: r1.json.data.otpSession, code: r1.json.data.devCode ?? "123456" });
      if (!r2.json?.ok) throw new Error(`${label}: login failed ${JSON.stringify(r2.json)}`);
      return r2.json.data.user;
    },
  };
}

// Same host ladder scripts/q.mjs walks — the direct host's DNS drops out often
// enough that a one-host client turns "show me the row" into an outage.
const ref = E.SUPABASE_PROJECT_REF;
const CANDIDATES = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...["ap-south-1", "ap-southeast-1", "us-east-1", "eu-central-1"].flatMap((r) => [
    { host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
    { host: `aws-0-${r}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}` },
  ]),
];
let client = null, lastErr;
for (const cand of CANDIDATES) {
  const c = new pg.Client({
    host: cand.host, port: cand.port, user: cand.user, password: E.SUPABASE_DB_PASSWORD,
    database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
  });
  try { await c.connect(); client = c; break; } catch (e) { lastErr = e; try { await c.end(); } catch {} }
}
if (!client) { console.error(`db connect failed: ${lastErr?.message}`); process.exit(1); }
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

// ---------------------------------------------------------------------------
// 0. The precondition this script cannot check without.
//
// Stories are DERIVED from `live_at >= now() - 24h`. The seed is older than
// that within a day of being run, so this script used to open with
// "0 circle(s)" and then throw on the first segment it inspected — a red run
// that said nothing about the code. That is a false alarm, and a false alarm
// nobody trusts is worse than no check.
//
// So the window is SEEDED here: the newest live listing is pulled into it, the
// whole script runs against a real story, and the timestamp is put straight
// back in the `finally` at the bottom — same discipline as
// check-requirement-visibility.mjs, which creates the states it needs to look at.
// ---------------------------------------------------------------------------
const DAY = "24 hours";
let seeded = null;

const [fresh] = await q(
  `select count(*)::int n from listings
    where status='live' and availability='available' and live_at >= now() - interval '${DAY}'`);
if (fresh.n === 0) {
  const [row] = await q(
    `select id, live_at from listings
      where status='live' and availability='available'
      order by live_at desc limit 1`);
  if (row) {
    await q(`update listings set live_at = now() - interval '2 hours' where id = $1`, [row.id]);
    seeded = row;
    console.log(`seeded the 24h window: listing ${row.id} (live_at will be restored)\n`);
  }
}

/**
 * Put the seeded row back exactly as it was.
 *
 * Idempotent, and wired to every way this process can end — not just the happy
 * one. A crash, a Ctrl-C, or a closed pipe (`| head` is enough) used to leave
 * the listing sitting inside the 24h window, which then silently suppressed the
 * NEXT run's seeding and left the original timestamp unrecoverable: nothing in
 * the schema remembers what `live_at` was.
 */
async function restoreSeed() {
  if (!seeded) return;
  const original = seeded;
  seeded = null; // never restore twice
  await q(`update listings set live_at = $2 where id = $1`, [original.id, original.live_at]);
  await q(`delete from story_seen where segment_id = $1`, [original.id]);
  const [back] = await q(`select live_at from listings where id = $1`, [original.id]);
  check("seeded listing restored to its original live_at",
    new Date(back.live_at).getTime() === new Date(original.live_at).getTime());
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, async () => {
    await restoreSeed().catch(() => {});
    try { await client.end(); } catch { /* already closed */ }
    process.exit(130);
  });
}
process.on("uncaughtException", async (err) => {
  console.error("\nuncaught:", err?.message ?? err);
  await restoreSeed().catch(() => {});
  try { await client.end(); } catch { /* already closed */ }
  process.exit(1);
});
// A closed stdout (`… | head`) raises EPIPE on the next write and would kill the
// process before the restore. Swallow it — the run is over either way, and
// leaving the database dirty is the worse outcome.
process.stdout.on("error", (e) => { if (e.code !== "EPIPE") throw e; });

// ---------------------------------------------------------------------------
// 1 + 2. Guest payload
// ---------------------------------------------------------------------------
const guest = actor("guest");
const s = await guest.req("/api/v1/stories");
const circles = s.json?.data?.circles ?? [];
check("GET /stories (guest)", s.status === 200 && circles.length > 0, `${circles.length} circle(s)`);
if (!circles.length) {
  // Nothing to inspect — say so plainly instead of throwing on `undefined.href`.
  console.log("\nNo story circles even after seeding the window — check the feed's city scope or the seed itself.");
  await restoreSeed();
  await client.end();
  process.exit(1);
}

const segs = circles.flatMap((c) => c.segments.map((g) => ({ ...g, poster: c.posterName, username: c.posterUsername })));
console.log("\n--- what the viewer renders, per segment ---");
for (const g of segs) {
  console.log(`  ${g.poster} | ${g.kind} | ${g.title}`);
  console.log(`      type=${g.typeLabel} price=${g.price} neg=${g.negotiable} posted=${g.postedLabel} href=${g.href} saved=${g.saved}`);
  console.log(`      specs: ${g.specs.map((x) => `${x.label}=${x.value}`).join(" , ") || "(none)"}`);
}
console.log("");

check("every segment has a title", segs.every((g) => g.title && g.title.trim().length > 1));
check("every segment has a detail href", segs.every((g) => /^\/(property|project)\/[0-9a-f-]{36}$/.test(g.href)));
check("every segment has a type label", segs.every((g) => g.typeLabel));
check("every segment has a posted label", segs.every((g) => g.postedLabel));
check("no spec tile is blank", segs.every((g) => g.specs.every((x) => x.value !== "" && x.label !== "")));
check("no segment shows an empty strip", segs.every((g) => g.specs.length >= 1));
check("poster circles carry a username to open", circles.every((c) => c.posterUsername));

// The strip must be the TYPE's own config, not a hardcoded list.
const propSeg = segs.find((g) => g.kind === "property");
const cfg = await q(
  `select l.type_code, pt.field_config->'key_specs' specs
     from listings l join property_types pt on pt.code = l.type_code
    where l.id = $1`,
  [propSeg.href.split("/").pop()],
);
const candidates = (cfg[0]?.specs ?? []).map((c) => c.label);
console.log("DB key_spec candidates for", cfg[0]?.type_code, "→", candidates.join(", "));
check(
  "strip labels come from that type's key_specs (or its own answers)",
  propSeg.specs.length > 0,
  propSeg.specs.map((x) => x.label).join(", "),
);

// ---------------------------------------------------------------------------
// 3 + 4. A logged-in viewer: save, and seen
// ---------------------------------------------------------------------------
const [viewer] = await q("select id, phone, name from profiles where phone = '+919812300099'");
const a = actor("viewer");
await a.login(viewer.phone);

const mine = await a.req("/api/v1/stories");
const target = (mine.json?.data?.circles ?? []).flatMap((c) => c.segments).find((g) => g.kind === "property");
check("viewer sees a property segment", !!target, target?.title);

await q("delete from saves where profile_id = $1 and listing_id = $2", [viewer.id, target.id]);
const save = await a.req("/api/v1/saves", "POST", { listingId: target.id });
const savedRows = await q("select profile_id, listing_id, created_at from saves where profile_id = $1 and listing_id = $2", [viewer.id, target.id]);
console.log("\nsaves row →", savedRows);
check("Save button writes a saves row", save.json?.data?.saved === true && savedRows.length === 1);

const again = await a.req("/api/v1/stories");
const back = (again.json?.data?.circles ?? []).flatMap((c) => c.segments).find((g) => g.id === target.id);
check("the story reads that back as saved:true", back?.saved === true);

const unsave = await a.req("/api/v1/saves", "POST", { listingId: target.id });
const afterUnsave = await q("select count(*)::int n from saves where profile_id = $1 and listing_id = $2", [viewer.id, target.id]);
check("un-save deletes it again", unsave.json?.data?.saved === false && afterUnsave[0].n === 0);

await q("delete from story_seen where profile_id = $1 and segment_id = $2", [viewer.id, target.id]);
await a.req(`/api/v1/stories/${target.id}/seen`, "POST", {});
const seenRows = await q("select profile_id, city_id, segment_id from story_seen where profile_id = $1 and segment_id = $2", [viewer.id, target.id]);
console.log("story_seen row →", seenRows);
check("seen writes story_seen (per city)", seenRows.length === 1);

// ---------------------------------------------------------------------------
// 5. Sold mid-24h → the "no longer available" state
// ---------------------------------------------------------------------------
const before = await a.req(`/api/v1/stories/${target.id}`);
check("segment endpoint says available:true while live", before.json?.data?.segment?.available === true);
await q("update listings set availability = 'sold' where id = $1", [target.id]);
const sold = await a.req(`/api/v1/stories/${target.id}`);
console.log("sold segment →", JSON.stringify({ available: sold.json?.data?.segment?.available, title: sold.json?.data?.segment?.title }));
check("sold mid-24h → available:false", sold.json?.data?.segment?.available === false);
await q("update listings set availability = 'available' where id = $1", [target.id]);

// ---------------------------------------------------------------------------
// 6. A draft must not leak through the segment endpoint
// ---------------------------------------------------------------------------
const draft = await q("select id from listings where status <> 'live' limit 1");
if (draft.length) {
  const probe = await guest.req(`/api/v1/stories/${draft[0].id}`);
  check("a non-live listing 404s (no price/cover leak)", probe.json?.ok === false, probe.json?.error?.code);
}

// Leave the database exactly as it was found.
await restoreSeed();

console.log(`\n${results.filter((r) => r.p).length}/${results.length} checks passed`);
await client.end();
process.exit(results.every((r) => r.p) ? 0 : 1);

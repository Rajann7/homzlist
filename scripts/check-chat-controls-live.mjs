/**
 * Chat CONTROLS live check — every clickable in the chat module, driven through
 * the real endpoints, each one proven by the row it wrote.
 *
 * The Messages spec's controls are easy to ship as buttons that only toast. This
 * walks them: the ⋯ chat menu (view profile / propose visit / mute / search /
 * block / report / not-interested), the message long-press sheet (react / reply /
 * delete for-me / delete for-everyone / report), the row swipe + long-press
 * (pin / mute / archive / delete), quick-reply template CRUD, and the header
 * sub-screens (requests / archived / blocked).
 *
 *   node scripts/check-chat-controls-live.mjs http://seller.localhost:3000
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = (process.argv[2] ?? "http://seller.localhost:3000").replace(/\/$/, "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const ref = E.SUPABASE_PROJECT_REF;
const CANDIDATES = [
  { name: "direct", host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...["ap-south-1", "ap-southeast-1", "us-east-1", "eu-central-1"].flatMap((r) => [
    { name: `pooler-${r}:5432`, host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
    { name: `pooler-${r}:6543`, host: `aws-0-${r}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}` },
  ]),
];
async function connectDb() {
  let last;
  for (const c of CANDIDATES) {
    const cl = new pg.Client({ host: c.host, port: c.port, user: c.user, password: E.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try { await cl.connect(); console.log(`db: ${c.name}`); return cl; } catch (e) { last = e; try { await cl.end(); } catch {} }
  }
  throw new Error(`db connect failed: ${last?.message}`);
}
const db = await connectDb();

const results = [];
const check = (n, p, d = "") => { results.push({ n, p: !!p, d }); console.log(`${p ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); };

function actor(label) {
  const jar = new Map();
  return {
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
      const text = await r.text().catch(() => "");
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, text };
    },
    async login(phone) {
      const a = await this.req("/api/v1/auth/otp/request", "POST", { phone });
      if (!a.json?.ok) throw new Error(`${label} otp: ${a.text}`);
      const b = await this.req("/api/v1/auth/otp/verify", "POST", { otpSession: a.json.data.otpSession, code: a.json.data.devCode ?? "123456" });
      if (!b.json?.ok) throw new Error(`${label} verify: ${b.text}`);
    },
  };
}

// Walk the controls once per SELLER ROLE, so an owner, a broker and a builder
// each prove their own chat works — roles differ in what the server returns.
const { rows: roles } = await db.query(`
  select distinct on (pp.role) t.id thread, pp.role, pp.id poster_id, pp.name poster, pp.phone poster_phone,
         bp.id buyer_id, bp.name buyer, bp.phone buyer_phone
    from chat_threads t
    join profiles pp on pp.id = t.poster_id
    join profiles bp on bp.id = t.buyer_id
   where t.status='accepted' and pp.state='active' and bp.state='active'
     and pp.name is not null and pp.city_id is not null
     and bp.name is not null and bp.city_id is not null
   order by pp.role, t.last_message_at desc`);

console.log(`roles covered: ${roles.map((r) => r.role).join(", ")}\n`);

for (const r of roles) {
  const tag = r.role.toUpperCase();
  console.log(`\n── ${tag} · ${r.poster} ↔ ${r.buyer} ──`);
  const buyer = actor("buyer"); await buyer.login(r.buyer_phone);
  const poster = actor("poster"); await poster.login(r.poster_phone);

  // ── ⋯ menu → Mute / Pin / Archive (thread state) ──────────────────────────
  await buyer.req(`/api/v1/chat/threads/${r.thread}/state`, "PATCH", { muted: true, pinned: true });
  let { rows: [st] } = await db.query(`select muted,pinned from thread_participants where thread_id=$1 and profile_id=$2`, [r.thread, r.buyer_id]);
  check(`${tag} ⋯ Mute + Pin persist`, st?.muted === true && st?.pinned === true, `muted=${st?.muted} pinned=${st?.pinned}`);

  await buyer.req(`/api/v1/chat/threads/${r.thread}/state`, "PATCH", { muted: false, pinned: false, archived: true });
  ({ rows: [st] } = await db.query(`select muted,pinned,archived from thread_participants where thread_id=$1 and profile_id=$2`, [r.thread, r.buyer_id]));
  check(`${tag} ⋯ Archive persists (and unmute/unpin)`, st?.archived === true && st?.muted === false, `archived=${st?.archived}`);

  // Archived sub-screen must actually list it.
  const arch = await buyer.req("/api/v1/chat/archived");
  check(`${tag} Archived screen lists the archived thread`, (arch.json?.data?.rows ?? []).some((x) => x.threadId === r.thread));

  // A new message auto-unarchives for both sides.
  await buyer.req(`/api/v1/chat/threads/${r.thread}/message`, "POST", { text: "unarchive me" });
  ({ rows: [st] } = await db.query(`select archived from thread_participants where thread_id=$1 and profile_id=$2`, [r.thread, r.buyer_id]));
  check(`${tag} new message auto-unarchives`, st?.archived === false, `archived=${st?.archived}`);

  // ── message long-press sheet ──────────────────────────────────────────────
  const send = await buyer.req(`/api/v1/chat/threads/${r.thread}/message`, "POST", { text: `control-test ${Date.now()}` });
  const msgId = send.json?.data?.message?.id;
  check(`${tag} send works`, !!msgId);

  // React (toggle on, then off)
  const react1 = await poster.req(`/api/v1/chat/messages/${msgId}`, "PATCH", { emoji: "👍" });
  let { rows: [mr] } = await db.query(`select reactions from chat_messages where id=$1`, [msgId]);
  check(`${tag} react persists`, react1.json?.ok === true && !!mr?.reactions?.["👍"], JSON.stringify(mr?.reactions));
  await poster.req(`/api/v1/chat/messages/${msgId}`, "PATCH", { emoji: "👍" });
  ({ rows: [mr] } = await db.query(`select reactions from chat_messages where id=$1`, [msgId]));
  check(`${tag} react toggles off`, !mr?.reactions?.["👍"], JSON.stringify(mr?.reactions));

  // An emoji outside the allowed set must be refused.
  const badEmoji = await poster.req(`/api/v1/chat/messages/${msgId}`, "PATCH", { emoji: "💩" });
  check(`${tag} unknown reaction refused`, badEmoji.json?.ok !== true, `status=${badEmoji.status}`);

  // Quoted reply
  const rep = await poster.req(`/api/v1/chat/threads/${r.thread}/message`, "POST", { text: "replying", replyTo: msgId });
  const { rows: [rr] } = await db.query(`select reply_to from chat_messages where id=$1`, [rep.json?.data?.message?.id ?? null]);
  check(`${tag} swipe-reply stores the quoted message`, rr?.reply_to === msgId, `reply_to=${rr?.reply_to ? "set" : "null"}`);

  // Report message
  const repo = await poster.req(`/api/v1/chat/messages/${msgId}`, "POST", { reason: "Spam", note: "control test" });
  const { rows: [rep2] } = await db.query(`select id,status from reports where subject_type='message' and subject_id=$1 and reporter_id=$2`, [msgId, r.poster_id]);
  check(`${tag} Report message writes a report row`, repo.json?.ok === true && !!rep2, `status=${rep2?.status}`);

  // Delete for me → hidden for that viewer only
  const own = await poster.req(`/api/v1/chat/threads/${r.thread}/message`, "POST", { text: `to-delete ${Date.now()}` });
  const ownId = own.json?.data?.message?.id;
  await buyer.req(`/api/v1/chat/messages/${ownId}?scope=me`, "DELETE");
  const buyerView = await buyer.req(`/api/v1/chat/threads/${r.thread}`);
  const posterView = await poster.req(`/api/v1/chat/threads/${r.thread}`);
  check(`${tag} delete-for-me hides it only for me`,
    !(buyerView.json?.data?.messages ?? []).some((m) => m.id === ownId) &&
    (posterView.json?.data?.messages ?? []).some((m) => m.id === ownId), "buyer hidden / poster still sees it");

  // Delete for everyone — only your OWN message, row soft-kept for admin
  const notMine = await buyer.req(`/api/v1/chat/messages/${ownId}?scope=everyone`, "DELETE");
  check(`${tag} delete-for-everyone refused on someone else's message`, notMine.json?.ok !== true, `status=${notMine.status}`);
  await poster.req(`/api/v1/chat/messages/${ownId}?scope=everyone`, "DELETE");
  const { rows: [tomb] } = await db.query(`select deleted_all, body from chat_messages where id=$1`, [ownId]);
  check(`${tag} delete-for-everyone tombstones but keeps the row (admin evidence)`, tomb?.deleted_all === true && tomb?.body === null, `deleted_all=${tomb?.deleted_all} body=${tomb?.body}`);

  // ── quick-reply templates CRUD ────────────────────────────────────────────
  const list1 = await poster.req("/api/v1/chat/templates");
  check(`${tag} quick replies load (defaults seeded)`, (list1.json?.data?.templates ?? []).length > 0, `${(list1.json?.data?.templates ?? []).length} templates`);
  const made = await poster.req("/api/v1/chat/templates", "POST", { body: `Control test ${Date.now()}` });
  const tid = made.json?.data?.id;
  check(`${tag} template create`, !!tid);
  await poster.req(`/api/v1/chat/templates/${tid}`, "PATCH", { body: "Edited by control test" });
  let { rows: [tpl] } = await db.query(`select body, profile_id from chat_templates where id=$1`, [tid]);
  check(`${tag} template edit persists`, tpl?.body === "Edited by control test", `body="${tpl?.body}"`);
  // A default (profile_id null) template must not be editable by a user.
  const def = (list1.json?.data?.templates ?? []).find((t) => t.isDefault);
  if (def) {
    const hack = await poster.req(`/api/v1/chat/templates/${def.id}`, "PATCH", { body: "hijacked" });
    const { rows: [d2] } = await db.query(`select body from chat_templates where id=$1`, [def.id]);
    check(`${tag} default template can't be overwritten`, d2?.body !== "hijacked", `ok=${hack.json?.ok}`);
  }
  await poster.req(`/api/v1/chat/templates/${tid}`, "DELETE");
  ({ rows: [tpl] } = await db.query(`select id from chat_templates where id=$1`, [tid]));
  check(`${tag} template delete`, !tpl);

  // ── ⋯ → Not interested (continuity) → lead pipeline ───────────────────────
  const cont = await poster.req(`/api/v1/chat/threads/${r.thread}/continuity`, "POST", { answer: "interested" });
  const { rows: [lead] } = await db.query(
    `select stage,last_activity from leads where owner_id=$1 and lead_profile_id=$2 order by last_activity_at desc limit 1`,
    [r.poster_id, r.buyer_id]);
  check(`${tag} ⋯ continuity answer moves the lead`, cont.json?.ok === true && lead?.stage === "contacted", `stage=${lead?.stage} "${lead?.last_activity}"`);

  // ── ⋯ → Report user, then Block / Unblock ─────────────────────────────────
  await buyer.req(`/api/v1/chat/threads/${r.thread}/block`, "POST", { action: "report", reason: "Fraud attempt", note: "control" });
  const { rows: [ur] } = await db.query(`select id from reports where reporter_id=$1 and subject_type='user' and subject_id=$2`, [r.buyer_id, r.poster_id]);
  check(`${tag} ⋯ Report user writes a report row`, !!ur);

  await buyer.req(`/api/v1/chat/threads/${r.thread}/block`, "POST", { action: "block" });
  const { rows: [blk] } = await db.query(`select 1 from chat_blocks where blocker_id=$1 and blocked_id=$2`, [r.buyer_id, r.poster_id]);
  check(`${tag} ⋯ Block writes a block row`, !!blk);
  const blockedSend = await buyer.req(`/api/v1/chat/threads/${r.thread}/message`, "POST", { text: "should fail" });
  check(`${tag} blocked thread refuses sending`, blockedSend.json?.ok !== true, `status=${blockedSend.status}`);
  const blockedList = await buyer.req("/api/v1/chat/blocked");
  check(`${tag} Blocked-users screen lists them`, (blockedList.json?.data?.users ?? []).some((u) => u.id === r.poster_id));
  await buyer.req("/api/v1/chat/blocked", "POST", { action: "unblock", userId: r.poster_id });
  const { rows: [unblk] } = await db.query(`select 1 from chat_blocks where blocker_id=$1 and blocked_id=$2`, [r.buyer_id, r.poster_id]);
  check(`${tag} Unblock removes it`, !unblk);

  // ── photo sending is OFF (button removed AND server refuses) ──────────────
  const photo = await buyer.req(`/api/v1/chat/threads/${r.thread}/message`, "POST", { photoUrl: "https://example.com/x.jpg" });
  check(`${tag} photo send refused server-side`, photo.json?.ok !== true, `status=${photo.status}`);

  // ── mark-read + details screen ────────────────────────────────────────────
  const det = await buyer.req(`/api/v1/chat/threads/${r.thread}/details`);
  check(`${tag} Chat details screen loads`, det.json?.ok === true, det.json?.ok ? "" : det.text.slice(0, 80));
  const readAll = await buyer.req("/api/v1/chat/read-all", "POST");
  check(`${tag} Mark all as read`, readAll.json?.ok === true);
}

// ---------------------------------------------------------------------------
console.log("\n──────── summary ────────");
const failed = results.filter((x) => !x.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("\nFAILED:"); failed.forEach((f) => console.log(`  ✗ ${f.n} — ${f.d}`)); }
await db.end();
process.exit(failed.length ? 1 : 0);

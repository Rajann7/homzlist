/**
 * Live proof for the trash screen (designs/P10 S4): soft-delete → it appears in
 * trash → restore → delete again → purge → the row is GONE from the database.
 *
 * Drives the real HTTP API and reads Postgres back after every step, so a pass
 * means the rows actually moved — not that a handler returned 200.
 *
 *   PORT=<dev port> node scripts/verify-trash.mjs
 */
import { connect } from "./lib/dbx.mjs";
import { makeClient } from "./lib/session.mjs";

const PORT = process.env.PORT ?? "3000";
const { session: login } = makeClient(`http://localhost:${PORT}`);
const sql = await connect();

let pass = 0, fail = 0;
const check = (cond, msg) => {
  cond ? pass++ : fail++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${msg}`);
};

const row = async (id) =>
  (await sql.query(`select id, status, deleted_at, slot_id from listings where id = $1`, [id])).rows[0] ?? null;

const ACTOR_PHONE = process.env.VERIFY_PHONE ?? "+919825012345";
const actor = await login(ACTOR_PHONE);
console.log(`actor ${ACTOR_PHONE} (${actor.user.role})\n`);

// Pick one of this seller's own listings that is NOT already deleted.
const { rows: [victim] } = await sql.query(
  `select id, title, status from listings
    where profile_id = $1 and status <> 'deleted' and deleted_at is null
    order by created_at desc limit 1`,
  [actor.user.id],
);
if (!victim) throw new Error("no listing to test with — run seed-module4-states.mjs first");
console.log(`using ${victim.id} (${victim.status}) "${victim.title}"\n`);

console.log("== soft delete → trash");
const del = await actor.call(`/api/v1/listings/${victim.id}`, { method: "DELETE" });
check(del.json?.ok === true, `DELETE returned ok (${del.status})`);
{
  const r = await row(victim.id);
  check(r?.status === "deleted" && r?.deleted_at !== null, `row is status=deleted with deleted_at set (${r?.status})`);
}

console.log("\n== it shows on the trash screen's data source");
{
  const t = await actor.call("/api/v1/listings/trash");
  const item = (t.json?.data?.items ?? []).find((i) => i.id === victim.id);
  check(Boolean(item), "appears in GET /listings/trash");
  check(typeof item?.daysLeft === "number", `daysLeft is server-computed (${item?.daysLeft})`);
  check(t.json?.data?.trashDays === 30, `trashDays is 30 (${t.json?.data?.trashDays})`);
}

console.log("\n== another user cannot see or purge it (IDOR)");
{
  const other = await login(process.env.VERIFY_OTHER ?? "+919999000007");
  const t = await other.call("/api/v1/listings/trash");
  const leaked = (t.json?.data?.items ?? []).some((i) => i.id === victim.id);
  check(!leaked, "it is absent from the other user's trash");
  const p = await other.call(`/api/v1/listings/${victim.id}/purge`, { method: "POST" });
  check(p.status === 404, `their purge is 404, not 403 (${p.status})`);
  check((await row(victim.id)) !== null, "and the row survived that attempt");
}

console.log("\n== anonymous cannot purge");
{
  const res = await fetch(`http://localhost:${PORT}/api/v1/listings/${victim.id}/purge`, { method: "POST" });
  check(res.status === 401, `anonymous purge is 401 (${res.status})`);
}

console.log("\n== restore puts it back");
{
  const r = await actor.call(`/api/v1/listings/${victim.id}/status`, {
    method: "POST", body: JSON.stringify({ action: "restore" }),
  });
  check(r.json?.ok === true, `restore returned ok (${r.status})`);
  const after = await row(victim.id);
  check(after?.status !== "deleted" && after?.deleted_at === null, `row is out of trash (status=${after?.status})`);
}

console.log("\n== a LIVE listing cannot be purged — only something in trash");
{
  const p = await actor.call(`/api/v1/listings/${victim.id}/purge`, { method: "POST" });
  check(p.status === 404, `purge of a non-trashed listing is refused (${p.status})`);
  check((await row(victim.id)) !== null, "and the row is still there");
}

console.log("\n== delete again, then Delete now → row is gone");
{
  await actor.call(`/api/v1/listings/${victim.id}`, { method: "DELETE" });
  check((await row(victim.id))?.status === "deleted", "back in trash");

  const p = await actor.call(`/api/v1/listings/${victim.id}/purge`, { method: "POST" });
  check(p.json?.ok === true, `purge returned ok (${p.status})`);
  check((await row(victim.id)) === null, "the listings row no longer exists in Postgres");

  const { rows: [photos] } = await sql.query(
    `select count(*)::int as n from listing_photos where listing_id = $1`, [victim.id],
  );
  check(photos.n === 0, `its photo rows went with it (${photos.n} left)`);

  const again = await actor.call(`/api/v1/listings/${victim.id}/purge`, { method: "POST" });
  check(again.status === 404, `purging it twice is a clean 404 (${again.status})`);
}

console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILED`} — ${pass} passed, ${fail} failed`);
await sql.end();
process.exit(fail === 0 ? 0 : 1);

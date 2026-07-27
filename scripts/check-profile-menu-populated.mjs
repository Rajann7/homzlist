/**
 * Populated-state check for the profile ⋯ menu modules. The empty states pass
 * trivially; this exercises the states that only exist once there are rows:
 * a saved tile with a price DROP, a collection filter, recently-viewed, and the
 * Restore (reactivate) action on an archived RENTED listing.
 *
 *   node scripts/check-profile-menu-populated.mjs
 */
const BASE = process.env.MENU_BASE || "http://localhost:3000";
const PHONE = "+919824100011"; // Hiral Desai (owner) — the seeded actor

const jar = new Map();
function save(res) {
  for (const ck of res.headers.getSetCookie?.() ?? []) {
    const [pair] = ck.split(";"); const i = pair.indexOf("=");
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function api(p, { method = "GET", body, ip } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}), cookie: cookie() },
    body: body ? JSON.stringify(body) : undefined,
  });
  save(res);
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

let fails = 0;
const check = (cond, label, extra = "") => {
  if (!cond) fails++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " — " + extra : ""}`);
};

const ip = "203.0.113.150";
const r = await api("/api/v1/auth/otp/request", { method: "POST", body: { phone: PHONE }, ip });
const v = await api("/api/v1/auth/otp/verify", {
  method: "POST", ip,
  body: { otpSession: r.json?.data?.otpSession, code: r.json?.data?.devCode ?? "123456" },
});
check(v.status === 200, "logged in as seeded owner");

console.log("\n== Saved (populated) ==");
const sv = await api("/api/v1/saved");
const d = sv.json?.data;
check(sv.status === 200 && (d?.tiles?.length ?? 0) === 2, "two saved tiles", `${d?.tiles?.length} tiles`);
const dropped = (d?.tiles ?? []).filter((t) => t.dropLabel);
check(dropped.length === 1, "exactly one tile shows a price drop", dropped[0]?.dropLabel ?? "none");
// ₹90,000 snapshot − ₹65,000 current = ₹25,000, rendered with the design's ↓.
check(dropped[0]?.dropLabel === "↓ ₹25,000", "drop amount is computed from the snapshot", dropped[0]?.dropLabel);
check(d?.changedCount === 1, "changedCount is real", String(d?.changedCount));
const chips = d?.collections ?? [];
check(chips[0]?.name === "All" && chips[0]?.count === 2, "All chip counts every save", String(chips[0]?.count));
const shortlist = chips.find((c) => c.name === "Shortlist");
check(shortlist?.count === 1, "collection chip has its real count", String(shortlist?.count));

// Collection filter must return only that collection's saves.
const filtered = await api(`/api/v1/saved?collection=${shortlist?.id}`);
check((filtered.json?.data?.tiles ?? []).length === 1, "collection filter narrows the grid", `${filtered.json?.data?.tiles?.length} tile`);

// Move a save out of the collection and back — proves assign persists.
const target = (d?.tiles ?? []).find((t) => t.collectionId);
const out = await api(`/api/v1/saved/items/${target.saveId}`, { method: "PATCH", body: { collectionId: null } });
check(out.status === 200, "move save out of collection", String(out.status));
const after = await api("/api/v1/saved");
check((after.json?.data?.collections ?? []).find((c) => c.name === "Shortlist")?.count === 0, "chip count drops to 0 after the move");
await api(`/api/v1/saved/items/${target.saveId}`, { method: "PATCH", body: { collectionId: shortlist.id } });

console.log("\n== Activity (populated) ==");
const ac = await api("/api/v1/activity");
const ad = ac.json?.data;
check((ad?.recentlyViewed?.length ?? 0) === 2, "recently viewed reads back", `${ad?.recentlyViewed?.length} tiles`);
check(ad?.counts?.saved === 2, "activity saved count matches Saved", String(ad?.counts?.saved));
check(!!ad?.recentlyViewed?.[0]?.price, "recent tile carries a formatted price", ad?.recentlyViewed?.[0]?.price);

console.log("\n== Archived + Restore (populated) ==");
const ar = await api("/api/v1/listings/archived");
const items = ar.json?.data?.items ?? [];
const seed = items.find((i) => i.title === "SEED Rented 2BHK Alkapuri");
check(!!seed, "archived rented listing is listed", `${items.length} archived`);
check(seed?.canReactivate === true, "rented listing offers Restore");
check(!!seed?.archivedAt, "archivedAt present for the 'Archived <date>' line");

const restored = await api(`/api/v1/listings/${seed.id}/status`, { method: "POST", body: { action: "reactivate" } });
check(restored.status === 200, "POST reactivate (Restore)", String(restored.status));
check(["live", "pending_review"].includes(restored.json?.data?.listing?.status), "restored to a live-ish status", restored.json?.data?.listing?.status);
const after2 = await api("/api/v1/listings/archived");
check(!(after2.json?.data?.items ?? []).some((i) => i.id === seed.id), "restored listing left the archive");

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`}`);
process.exit(fails === 0 ? 0 : 1);

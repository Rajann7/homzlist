/**
 * Seed one real row for every Module 4 state, by driving the real HTTP API —
 * not by writing rows behind the app's back.
 *
 * Doc/CLAUDE rule: "a status with 0 rows in the DB has never run — seed every
 * state and look at it". Before this script the database had never held a
 * listing in payment_pending, pending_review, hidden or archived, had never had
 * availability sold/rented/completed, and had no listing or draft with photos —
 * so screens 5, 6, 14, 17, 18 and 19 had never been rendered against real data.
 *
 *   node scripts/seed-module4-states.mjs
 */
import { createHmac } from "node:crypto";
import sharp from "sharp";
import { connect, env } from "./lib/dbx.mjs";
import { makeClient } from "./lib/session.mjs";

const PORT = process.env.PORT ?? "55233";
const BASE = `http://localhost:${PORT}`;
const { session: login } = makeClient(BASE);

const sql = await connect();
const log = (...a) => console.log(...a);

// --------------------------------------------------------------- photos -----
/** Deterministic, obviously-synthetic room photos so shots are reproducible. */
async function makeJpeg(seed, label) {
  const hues = [[210, 180, 150], [150, 190, 210], [200, 200, 170], [180, 160, 200], [170, 200, 180], [210, 200, 190]];
  const [r, g, b] = hues[seed % hues.length];
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
       <rect width="1200" height="900" fill="rgb(${r},${g},${b})"/>
       <rect x="80" y="120" width="1040" height="660" fill="rgba(255,255,255,.35)"/>
       <text x="600" y="470" font-family="Arial" font-size="64" fill="#333" text-anchor="middle">${label}</text>
     </svg>`,
  );
  return sharp(svg).jpeg({ quality: 82 }).toBuffer();
}

async function addPhotos(session, listingId, count) {
  const files = Array.from({ length: count }, () => ({ contentType: "image/jpeg", size: 200000 }));
  const pre = await session.call( `/api/v1/listings/${listingId}/photos/presign`, {
    method: "POST", body: JSON.stringify({ files }),
  });
  const grants = pre.json?.data?.grants;
  if (!grants) return { error: JSON.stringify(pre.json?.error ?? pre.status) };

  const keys = [];
  for (let i = 0; i < grants.length; i++) {
    const buf = await makeJpeg(i, ["Living room", "Kitchen", "Bedroom", "Bathroom", "Balcony", "Exterior"][i % 6]);
    const put = await fetch(grants[i].url, {
      method: "PUT", body: buf, headers: { "content-type": "image/jpeg" },
    });
    if (!put.ok) return { error: `R2 PUT ${put.status}` };
    keys.push(grants[i].key);
  }
  const commit = await session.call( `/api/v1/listings/${listingId}/photos/commit`, {
    method: "POST", body: JSON.stringify({ keys }),
  });
  if (!commit.json?.ok) return { error: JSON.stringify(commit.json?.error) };
  return { added: commit.json.data.added, rejected: commit.json.data.rejected };
}

// ---------------------------------------------------------------- slots -----
/**
 * Buy a listing slot the real way: checkout → signed Razorpay webhook. Razorpay
 * cannot reach localhost, so the delivery is signed locally with the same
 * HMAC-SHA256 over the raw body that production recomputes — the endpoint and
 * every downstream effect (payment, user_plan, invoice, slot) are identical.
 */
async function buySlot(session, planId) {
  const co = await session.call("/api/v1/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ planId, idempotencyKey: `seed-${planId}-${Date.now()}-${Math.random()}` }),
  });
  const orderId = co.json?.data?.orderId;
  if (!orderId) throw new Error(`checkout ${planId}: ${co.status} ${JSON.stringify(co.json?.error)}`);

  const { rows: [order] } = await sql.query(
    `select razorpay_order_id, total_paise, currency from orders where id = $1`, [orderId],
  );
  if (!order?.razorpay_order_id) throw new Error(`order ${orderId} has no razorpay order id`);

  const body = JSON.stringify({
    entity: "event", event: "payment.captured", contains: ["payment"],
    payload: { payment: { entity: {
      id: "pay_SEED" + Math.random().toString(36).slice(2, 12).toUpperCase(),
      entity: "payment", amount: Number(order.total_paise), currency: order.currency ?? "INR",
      status: "captured", order_id: order.razorpay_order_id, method: "upi",
      vpa: "test@okhdfcbank", captured: true, error_description: null,
    } } },
    created_at: Math.floor(Date.now() / 1000),
  });
  const res = await fetch(`${BASE}/api/v1/billing/webhook/rzp-3f9c1a`, {
    method: "POST", body,
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex"),
      "x-razorpay-event-id": "evt_SEED" + Math.random().toString(36).slice(2, 12),
    },
  });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
  return orderId;
}

/**
 * There is no "extra listing" top-up in the catalog — a second listing means a
 * second ₹999 plan — so rather than guess at the remaining quota, let the
 * server be the judge: create, and if it answers PLAN_REQUIRED, buy and retry.
 */
async function withSlot(session, planId, create) {
  try {
    return await create();
  } catch (e) {
    if (!/PLAN_REQUIRED/.test(e.message)) throw e;
    await buySlot(session, planId);
    return create();
  }
}

// -------------------------------------------------------------- listings ----
async function createListing(session, { typeCode = "flat", kind = "sell", title }) {
  const cfg = await session.call( "/api/v1/listings/config");
  const data = cfg.json?.data;
  const type = data.types.find((t) => t.code === typeCode) ?? data.types[0];
  const attributes = {};
  for (const f of type.fields) {
    const def = data.fieldDefs?.[f];
    attributes[f] =
      def?.control === "chips" || def?.control === "select" ? def.options?.[0]?.value ?? "yes"
      : def?.control === "toggle" ? true
      : /area|sqft|size/.test(f) ? 1450
      : /bhk|bath|washroom|balcon|floor|count|units|height/.test(f) ? 3
      : "Yes";
  }
  const res = await session.call( "/api/v1/listings", {
    method: "POST",
    body: JSON.stringify({
      typeCode: type.code,
      kind: type.kinds.includes(kind) ? kind : type.kinds[0],
      title,
      description: "Seeded by scripts/seed-module4-states.mjs so this state has a real row to render.",
      pricePaise: kind === "rent" ? 2500000 : 8500000000,
      areaId: AREA, cityId: session.user.cityId,
      attributes, amenities: (data.amenities ?? []).slice(0, 4).map((a) => a.label),
      contactPublic: false,
    }),
  });
  const id = res.json?.data?.listing?.id;
  if (!id) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.json?.error)}`);
  return id;
}

const PLAN = process.env.SEED_PLAN ?? "p999"; // the only plan that grants a listing slot
const AREA = "d403feb9-6f66-4b23-846c-669f8ebf6022"; // Mavdi, Rajkot

// ------------------------------------------------------------------ main ----
// A staff account is needed to move things out of pending_review.
const staffRow = (await sql.query(
  `select p.phone from staff s join profiles p on p.id = s.profile_id limit 1`,
)).rows[0];
if (!staffRow) throw new Error("no staff row — cannot exercise moderation");

const SELLER_PHONE = process.env.SEED_SELLER ?? "+919825012345";
const seller = await login(SELLER_PHONE);
const staff = await login(staffRow.phone);
log(`seller ${SELLER_PHONE} (${seller.user.role}) · staff ${staffRow.phone}`);

const moderate = (id, action, extra = {}) =>
  staff.call( `/api/v1/admin/moderate/listing/${id}`, {
    method: "POST", body: JSON.stringify({ action, ...extra }),
  });
const submit = (id) => seller.call( `/api/v1/listings/${id}/submit`, { method: "POST", body: "{}" });
const status = (id, action) =>
  seller.call( `/api/v1/listings/${id}/status`, { method: "POST", body: JSON.stringify({ action }) });

const made = {};
const step = async (label, fn) => {
  try { const r = await fn(); log(`  ✓ ${label}${r ? ` → ${r}` : ""}`); }
  catch (e) { log(`  ✗ ${label}: ${e.message}`); }
};

log("\n== photos on a live listing (screens 14/17 had none)");
await step("live listing with 6 real photos", async () => {
  const id = await withSlot(seller, PLAN, () => createListing(seller, { title: "3 BHK Flat in Shree Residency" }));
  made.photoListing = id;
  const p = await addPhotos(seller, id, 6);
  if (p.error) throw new Error(p.error);
  await submit(id);
  const m = await moderate(id, "approve");
  if (!m.json?.ok) throw new Error(JSON.stringify(m.json?.error));
  return `${id} · ${p.added} photos · ${m.json.data.status}`;
});

log("\n== states that had never existed");
await step("pending_review", async () => {
  const id = await withSlot(seller, PLAN, () => createListing(seller, { title: "2 BHK Flat awaiting review" }));
  made.pendingReview = id;
  await addPhotos(seller, id, 3); // submit refuses a listing with no photos
  const s = await submit(id);
  if (!s.json?.ok) throw new Error(JSON.stringify(s.json?.error));
  return id;
});

await step("sold (availability=sold, archived)", async () => {
  const id = await withSlot(seller, PLAN, () => createListing(seller, { title: "3 BHK Flat — sold" }));
  made.sold = id;
  await addPhotos(seller, id, 4);
  await submit(id);
  await moderate(id, "approve");
  const r = await status(id, "sold");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json?.error));
  return id;
});

await step("rented (availability=rented)", async () => {
  const id = await withSlot(seller, PLAN, () => createListing(seller, { typeCode: "flat", kind: "rent", title: "2 BHK Flat — rented out" }));
  made.rented = id;
  await addPhotos(seller, id, 3);
  await submit(id);
  await moderate(id, "approve");
  const r = await status(id, "rented");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json?.error));
  return id;
});

await step("hidden", async () => {
  const id = await withSlot(seller, PLAN, () => createListing(seller, { title: "3 BHK Flat — hidden by owner" }));
  made.hidden = id;
  await addPhotos(seller, id, 2);
  await submit(id);
  await moderate(id, "approve");
  const r = await status(id, "hide");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json?.error));
  return id;
});

// The creation screens (post type / property type / form) only render for a
// seller who still HAS a slot — otherwise CreateEntry correctly shows the plan
// wall instead, and the pixel-diff shoots the wrong screen.
log("\n== a spare slot for the creation-flow screens");
await step("owner +919999000004 holds an unconsumed listing slot", async () => {
  const actor = await login("+919999000004");
  const { rows: [row] } = await sql.query(
    `select count(*)::int as free
       from listing_slots s
      where s.profile_id = $1 and s.state = 'reserved'`,
    [actor.user.id],
  );
  if (row.free > 0) return `already has ${row.free}`;
  return `bought ${PLAN} → ${await buySlot(actor, PLAN)}`;
});

log("\n== database state after seeding");
const rows = await sql.query(
  `select status, availability, count(*)::int as n, sum((photo_count > 0)::int)::int as with_photos
     from listings where deleted_at is null group by 1,2 order by 1,2`,
);
console.table(rows.rows);
console.log(made);
await sql.end();

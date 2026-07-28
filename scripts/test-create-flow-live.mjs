/**
 * LIVE proof for the whole sell/rent creation flow, through the real HTTP API.
 *
 *   node scripts/test-create-flow-live.mjs            # all roles, all types
 *   CREATE_BASE=http://localhost:60536 node scripts/test-create-flow-live.mjs
 *
 * What it walks, per ROLE (owner, broker, builder) and per PROPERTY TYPE the
 * server offers that role, for every kind that type allows:
 *
 *   • fills EVERY field the type's config names — including the rent-only
 *     extras — with a value valid for that field's control,
 *   • posts it, then reads the row back OUT OF POSTGRES and checks that every
 *     field actually landed in `attributes`, that the location chain and the
 *     pincode are stored, and that `area_sqft` was derived,
 *   • reads the detail endpoint back and checks each attribute renders with its
 *     LABEL and its option's label, not the raw stored code,
 *   • runs the negative cases (no pincode, bad pincode, missing required
 *     attribute, wrong kind for the type),
 *   • checks the photo cap is enforced by the SERVER at presign,
 *   • and finishes with the unauthenticated + IDOR sweep.
 *
 * Quota is granted to the test users first (a listing costs a paid slot), and
 * everything it creates is deleted at the end unless KEEP=1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE = process.env.CREATE_BASE || "http://localhost:60536";
const KEEP = process.env.KEEP === "1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const pgc = new pg.Client({
  host: `db.${E.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
  password: E.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
});
await pgc.connect();
const q = async (sql, params) => (await pgc.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0] ?? null;

// ---- http with a cookie jar per user ---------------------------------------
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
const cookieHeader = (key) => [...(jar.get(key) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

async function api(key, p, { method = "GET", body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      "content-type": "application/json",
      // The creation flow lives on the seller zone; the host is what routes it.
      host: new URL(BASE).host,
      ...(key ? { cookie: cookieHeader(key) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (key) saveCookies(res, key);
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON (redirect/HTML) */ }
  return { status: res.status, json, data: json?.data, error: json?.error };
}

async function login(phone) {
  const req = await api(phone, "/api/v1/auth/otp/request", { method: "POST", body: { phone } });
  const code = req.data?.devCode ?? E.OTP_DEV_FIXED_CODE ?? "123456";
  await api(phone, "/api/v1/auth/otp/verify", { method: "POST", body: { otpSession: req.data?.otpSession, code } });
  const me = await api(phone, "/api/v1/auth/me");
  return me.data?.user?.role ?? me.data?.profile?.role ?? null;
}

// ---- reporting --------------------------------------------------------------
let failures = 0;
let checks = 0;
const fails = [];
function check(cond, msg, detail) {
  checks++;
  if (!cond) { failures++; fails.push(msg + (detail ? ` — ${detail}` : "")); }
  return cond;
}
const head = (s) => console.log(`\n=== ${s} ${"=".repeat(Math.max(0, 62 - s.length))}`);

// ---- the location we list everything in -------------------------------------
const place = await one(`
  select s.id state_id, d.id district_id, t.id taluka_id, c.id city_id, a.id area_id, a.name area_name, c.name city_name
    from locations s
    join locations d on d.parent_id = s.id and d.level='district' and d.name='Rajkot'
    join locations t on t.parent_id = d.id and t.level='taluka'   and t.name='Rajkot'
    join locations c on c.parent_id = t.id and c.level='city'     and c.name='Rajkot'
    join locations a on a.parent_id = c.id and a.level='area'     and a.name='Mavdi'
   where s.level='state' and s.name='Gujarat' limit 1`);
if (!place) { console.error("Rajkot → Mavdi not found; run scripts/seed-india-locations.mjs first"); process.exit(1); }
const pins = (await q(`select pincode from location_pincodes where location_id=$1 order by pincode`, [place.area_id]))
  .map((r) => r.pincode);
const PINCODE = pins[0];
console.log(`listing everything in ${place.area_name}, ${place.city_name} — pincode ${PINCODE} (area has ${pins.length})`);

// ---- users + quota ----------------------------------------------------------
const USERS = [
  { role: "owner", phone: "+919825000001" },
  { role: "broker", phone: "+919825012345" },
  { role: "builder", phone: "+919825000002" },
];

/**
 * The conditional-field and validation phases post ~20 more listings, and
 * `listing-create` is capped at 30 per hour per user (a real control, not a
 * test nuisance — it must NOT be raised to make this file pass). They run as a
 * fourth owner whose create budget is untouched by the 13-type walk above.
 */
const PROBE = { role: "owner", phone: "+919999000001" };

for (const u of [...USERS, PROBE]) {
  const p = await one(`select id, role from profiles where phone=$1`, [u.phone]);
  if (!p) { console.error(`no profile for ${u.phone}`); process.exit(1); }
  u.id = p.id;
  u.actualRole = p.role;
  // A listing is payment-first, so the test has to be able to pay. Granted
  // plans are a real admin path (user_plans.granted_by), not a bypass.
  await pgc.query(
    `insert into user_plans (profile_id, catalog_code, name, terms, listing_quota, listing_used, status, granted_by)
     values ($1, 'p999', 'Test grant', '{}'::jsonb, 200, 0, 'active', $1)`,
    [p.id],
  );
}

// ---- value generator: one valid value per control ---------------------------
/**
 * A plausible value for a field, from its DEFINITION. Nothing here knows a
 * field name — that is the point of the config-driven form, and a generator
 * that hardcoded "bhk = 3" would not notice a new field at all.
 */
function valueFor(def, landUnits) {
  switch (def.control) {
    case "chips":
    case "select":
      return def.options?.[0]?.value ?? null;
    case "multi":
      return def.options?.slice(0, 2).map((o) => o.value) ?? [];
    case "stepper":
      return 2;
    case "toggle":
      return true;
    case "number":
      return "3";
    case "date": {
      const d = new Date(Date.now() + 30 * 864e5);
      return d.toISOString().slice(0, 10);
    }
    case "area":
      return { value: "1200", unit: (def.units ?? (landUnits ? "land" : "built")) === "land" ? "guntha" : "sqft" };
    case "text":
    default:
      return `Test ${def.label}`;
  }
}

/**
 * A SECOND, independent implementation of the show_if grammar.
 *
 * Deliberately not imported from lib/listings/visibility: the whole point of
 * this file is to disagree with the server when the server is wrong. If both
 * sides ran the same function, a bug in it would pass every check here.
 */
function matches(cond, values) {
  if (!cond) return true;
  if (cond.all) return cond.all.every((c) => matches(c, values));
  if (cond.any) return cond.any.some((c) => matches(c, values));
  const raw = values[cond.field];
  if (cond.eq !== undefined) return (raw === true || raw === "true" || (typeof raw === "number" && raw !== 0)) === cond.eq;
  if (cond.gt !== undefined) return (Number(raw) || 0) > cond.gt;
  const v = raw === undefined || raw === null ? "" : String(raw);
  if (cond.in && !cond.in.includes(v)) return false;
  if (cond.not_in && cond.not_in.includes(v)) return false;
  return true;
}

/** Keys a type asks for, for this kind — `fields` plus the per-kind extras. */
function askedKeys(type, kind) {
  const extra = (kind === "rent" ? type.rentFields : type.sellFields) ?? [];
  return [...type.fields, ...extra.filter((k) => !type.fields.includes(k))];
}

/** Which of `keys` survive their conditions, given the values chosen. */
function visibleKeys(keys, fieldDefs, values) {
  const asked = new Set(keys);
  let cur = new Set(keys);
  for (let pass = 0; pass < 5; pass++) {
    const seen = {};
    for (const [k, v] of Object.entries(values)) if (!asked.has(k) || cur.has(k)) seen[k] = v;
    const next = new Set(keys.filter((k) => matches(fieldDefs[k]?.showIf, seen)));
    if (next.size === cur.size && [...next].every((k) => cur.has(k))) break;
    cur = next;
  }
  return keys.filter((k) => cur.has(k));
}

const created = [];

// ---- the walk ---------------------------------------------------------------
for (const u of USERS) {
  head(`ROLE ${u.role} (${u.phone})`);
  const role = await login(u.phone);
  check(role === u.actualRole, `${u.role}: logged in`, `got role ${role}`);

  const cfg = await api(u.phone, "/api/v1/listings/config");
  if (!check(cfg.status === 200, `${u.role}: config loads`, `status ${cfg.status}`)) continue;

  const { types, fieldDefs, fieldGroups } = cfg.data;
  check(fieldGroups?.length > 0, `${u.role}: field groups are served`, `got ${fieldGroups?.length}`);
  console.log(`  types offered: ${types.map((t) => t.code).join(", ")}`);
  // Doc2 §5.1 — a Builder is never offered PG/Hostel.
  check(
    u.role !== "builder" || !types.some((t) => t.code === "pg"),
    "builder is not offered PG/Hostel",
  );

  for (const type of types) {
    for (const kind of type.kinds) {
      const label = `${u.role}/${type.code}/${kind}`;

      // Fill EVERY field the type names for this kind — INCLUDING the ones a
      // real form would have hidden. Posting the hidden ones on purpose is the
      // test: the server has to drop them, because the browser is where a stale
      // possession date otherwise survives a switch to ready-to-move.
      const keys = askedKeys(type, kind);
      const values = {};
      for (const k of keys) {
        const def = fieldDefs[k];
        if (def) values[k] = valueFor(def, type.areaUnits);
      }
      const shownKeys = visibleKeys(keys, fieldDefs, values);
      const hiddenKeys = keys.filter((k) => !shownKeys.includes(k));

      const RENT_COLUMNS = new Set(["deposit", "available_from", "maintenance_included"]);
      const attrs = {};
      for (const [k, v] of Object.entries(values)) if (!RENT_COLUMNS.has(k)) attrs[k] = v;
      // What must come back: the visible keys, minus those with their own column.
      const expectAttrs = shownKeys.filter((k) => !RENT_COLUMNS.has(k));

      const payload = {
        typeCode: type.code,
        kind,
        title: `Test ${type.label} for ${kind} in Mavdi`,
        description: `Automated coverage check for ${type.label}. This description is deliberately long enough to clear the forty-character warning threshold.`,
        pricePaise: 5_000_000_00,
        priceOnRequest: false,
        isNegotiable: true,
        depositPaise: values.deposit ? Number(values.deposit) * 100 : null,
        maintenancePaise: values.maintenance ? Number(values.maintenance) * 100 : null,
        availableFrom: values.available_from ?? null,
        maintenanceIncluded: !!values.maintenance_included,
        stateId: place.state_id,
        districtId: place.district_id,
        talukaId: place.taluka_id,
        cityId: place.city_id,
        areaId: place.area_id,
        areaLabel: `${place.area_name}, ${place.city_name}`,
        pincode: PINCODE,
        attributes: attrs,
        amenities: ["security", "power_backup"],
        contactPublic: true,
        contactNumber: "9825000001",
        whatsappNumber: "9825000001",
        altNumber: null,
        photoCount: 0,
      };

      const res = await api(u.phone, "/api/v1/listings", { method: "POST", body: payload });
      if (!check(res.status === 200, `${label}: created`, `status ${res.status} ${JSON.stringify(res.error ?? {}).slice(0, 300)}`)) continue;

      const id = res.data.listing.id;
      created.push(id);

      // ---- proof from Postgres, not from the 200 ----------------------------
      const row = await one(
        `select id, type_code, kind, status, pincode, city_id, area_id, state_id, district_id, taluka_id,
                area_sqft, attributes, amenities, deposit_paise, maintenance_paise, available_from,
                maintenance_included, contact_number, whatsapp_number
           from listings where id = $1`, [id]);

      check(row?.pincode === PINCODE, `${label}: pincode stored`, `got ${row?.pincode}`);
      check(row?.city_id === place.city_id && row?.area_id === place.area_id, `${label}: location chain stored`);
      check(row?.taluka_id === place.taluka_id && row?.district_id === place.district_id, `${label}: mid-chain stored`);

      const stored = row?.attributes ?? {};
      const missing = expectAttrs.filter((k) => stored[k] === undefined);
      check(missing.length === 0, `${label}: all ${expectAttrs.length} visible attributes persisted`, `missing: ${missing.join(", ")}`);

      // The other half of the same rule: a field the seller could not see has
      // no value, no matter what the payload claimed.
      const leaked = hiddenKeys.filter((k) => stored[k] !== undefined);
      check(leaked.length === 0, `${label}: ${hiddenKeys.length} hidden field(s) stripped by the server`, `leaked: ${leaked.join(", ")}`);

      // Nothing the type never asked for can be hung off the row either.
      const foreign = Object.keys(stored).filter((k) => !keys.includes(k));
      check(foreign.length === 0, `${label}: no attribute outside the type's config`, `extra: ${foreign.join(", ")}`);

      // Any type carrying an area field must end up comparable in sq ft.
      const hasArea = shownKeys.some((k) => fieldDefs[k]?.control === "area");
      if (hasArea) check(row?.area_sqft > 0, `${label}: area converted to sq ft`, `area_sqft=${row?.area_sqft}`);

      if (kind === "rent") {
        if (values.deposit) check(Number(row?.deposit_paise) > 0, `${label}: deposit stored on its column`);
        if (values.available_from) check(!!row?.available_from, `${label}: available_from stored as a date`);
      }

      // ---- and what the detail screen will actually render -------------------
      const detail = await api(u.phone, `/api/v1/listings/${id}`);
      check(detail.status === 200, `${label}: detail loads`, `status ${detail.status}`);
      const rows = detail.data?.listing?.attributeRows ?? [];
      const raw = rows.filter((r) => /^[a-z0-9]+(_[a-z0-9]+)+$/.test(String(r.value)) || r.label === r.key);
      check(raw.length === 0, `${label}: detail shows labels, not raw codes`, raw.map((r) => `${r.key}=${r.value}`).join(", "));

      // Booleans that are false and empty values are dropped by design, so the
      // count is "every non-empty attribute has a row".
      const shown = new Set(rows.map((r) => r.key));
      const expectedShown = Object.entries(stored).filter(([, v]) =>
        v !== null && v !== "" && v !== false && !(Array.isArray(v) && !v.length) &&
        !(v && typeof v === "object" && !v.value)).map(([k]) => k);
      const notShown = expectedShown.filter((k) => !shown.has(k));
      check(notShown.length === 0, `${label}: every stored attribute is rendered`, `hidden: ${notShown.join(", ")}`);
    }
  }
}

// ---- conditional fields, both branches --------------------------------------
// The walk above only exercises whichever branch `valueFor` happens to pick
// (the first option of each chip row). These flip the drivers deliberately and
// assert the OPPOSITE set survives — a rule that only ever runs one way is a
// rule that has never been tested.
head("CONDITIONAL FIELDS");
{
  const u = PROBE;
  await login(u.phone);
  const base = {
    kind: "sell", cityId: place.city_id, areaId: place.area_id, stateId: place.state_id,
    districtId: place.district_id, talukaId: place.taluka_id, pincode: PINCODE,
    pricePaise: 5_000_000_00, description: "x".repeat(60), contactPublic: false, photoCount: 0,
  };
  const post = async (typeCode, attributes, title) => {
    const r = await api(u.phone, "/api/v1/listings", { method: "POST", body: { ...base, typeCode, title, attributes } });
    if (r.status !== 200) return { r, stored: null };
    created.push(r.data.listing.id);
    const row = await one(`select attributes from listings where id=$1`, [r.data.listing.id]);
    return { r, stored: row?.attributes ?? {} };
  };

  const AREA = { value: "1200", unit: "sqft" };

  // Rajan's own example: a tenement that is ready to move must not be asked —
  // or allowed to state — when it will be ready.
  let { stored } = await post("tenement", {
    bhk: "3", plot_area: AREA, builtup_area: AREA,
    construction_status: "ready_to_move", age: "1-5", possession: "2027-06", rera_id: "GJRERA123",
  }, "Ready-to-move tenement");
  check(stored?.age === "1-5", "ready-to-move keeps Age of property", JSON.stringify(stored?.age));
  check(stored?.possession === undefined, "ready-to-move drops Possession by", JSON.stringify(stored?.possession));
  check(stored?.rera_id === undefined, "ready-to-move drops the RERA number", JSON.stringify(stored?.rera_id));

  // Flip it: under construction keeps possession + RERA and drops the age.
  ({ stored } = await post("tenement", {
    bhk: "3", plot_area: AREA, builtup_area: AREA,
    construction_status: "under_construction", age: "1-5", possession: "2027-06", rera_id: "GJRERA123",
  }, "Under-construction tenement"));
  check(stored?.possession === "2027-06", "under construction keeps Possession by", JSON.stringify(stored?.possession));
  check(stored?.rera_id === "GJRERA123", "under construction keeps the RERA number");
  check(stored?.age === undefined, "under construction drops Age of property", JSON.stringify(stored?.age));

  // Road width has no meaning without road touch.
  ({ stored } = await post("plot_res", { land_area: AREA, road_touch: false, road_width: "30" }, "Interior plot"));
  check(stored?.road_width === undefined, "no road touch drops Road width", JSON.stringify(stored?.road_width));
  ({ stored } = await post("plot_res", { land_area: AREA, road_touch: true, road_width: "30" }, "Road-touch plot"));
  check(stored?.road_width === "30", "road touch keeps Road width", JSON.stringify(stored?.road_width));

  // Furnishing checklist: driven by `furnishing` on a home…
  ({ stored } = await post("flat", {
    bhk: "2", builtup_area: AREA, furnishing: "unfurnished", furnishing_details: ["AC", "Beds"],
  }, "Unfurnished flat"));
  check(stored?.furnishing_details === undefined, "unfurnished drops the furnishing checklist", JSON.stringify(stored?.furnishing_details));
  // …and by `shell_state` on a shop, which has no `furnishing` field at all.
  ({ stored } = await post("shop", {
    carpet_area: AREA, shell_state: "fitted", furnishing_details: ["AC"],
  }, "Fitted shop"));
  check(Array.isArray(stored?.furnishing_details), "a fitted shell keeps the furnishing checklist", JSON.stringify(stored?.furnishing_details));

  // Parking type only once there is parking to describe.
  ({ stored } = await post("flat", {
    bhk: "2", builtup_area: AREA, car_parking: 0, bike_parking: 0, parking_type: "covered",
  }, "No-parking flat"));
  check(stored?.parking_type === undefined, "zero parking drops Parking type", JSON.stringify(stored?.parking_type));

  // Sell-only questions are not accepted on a rent listing, and vice versa.
  const rent = await api(u.phone, "/api/v1/listings", {
    method: "POST",
    body: { ...base, kind: "rent", typeCode: "flat", title: "Rented flat",
      attributes: { bhk: "2", builtup_area: AREA, loan_available: true, ownership_type: "Freehold", tenant_preference: "Family" } },
  });
  if (check(rent.status === 200, "rent listing created", `status ${rent.status}`)) {
    created.push(rent.data.listing.id);
    const s = (await one(`select attributes from listings where id=$1`, [rent.data.listing.id]))?.attributes ?? {};
    check(s.loan_available === undefined, "a rent listing cannot carry the bank-loan flag", JSON.stringify(s.loan_available));
    check(s.ownership_type === undefined, "a rent listing cannot carry the ownership document");
    check(s.tenant_preference === "Family", "a rent listing keeps its tenant preference", JSON.stringify(s.tenant_preference));
  }

  // Mass assignment into `attributes` — a key no type asks for must not stick.
  ({ stored } = await post("flat", { bhk: "2", builtup_area: AREA, is_admin: true, shutter_count: "9" }, "Foreign-key flat"));
  check(stored?.is_admin === undefined, "an unknown attribute key is refused", JSON.stringify(stored?.is_admin));
  check(stored?.shutter_count === undefined, "another type's field is refused on a flat", JSON.stringify(stored?.shutter_count));

  // Cross-field sanity that only the server can enforce.
  let r = await api(u.phone, "/api/v1/listings", {
    method: "POST",
    body: { ...base, kind: "rent", typeCode: "pg", title: "Impossible PG",
      attributes: { pg_for: "boys", occupancy: "single", total_beds: "4", beds_available: "9" } },
  });
  check(r.status === 422 && r.error?.errors?.beds_available, "a PG cannot have more free beds than beds", JSON.stringify(r.error?.errors ?? {}).slice(0, 160));

  r = await api(u.phone, "/api/v1/listings", {
    method: "POST",
    body: { ...base, typeCode: "flat", title: "Impossible floor",
      attributes: { bhk: "2", builtup_area: AREA, floor: "9", total_floors: "4" } },
  });
  check(r.status === 422 && r.error?.errors?.floor, "a flat cannot be above its building's top floor", JSON.stringify(r.error?.errors ?? {}).slice(0, 160));
}

// ---- negative cases ---------------------------------------------------------
head("VALIDATION");
{
  const u = PROBE;
  const base = {
    typeCode: "flat", kind: "sell", title: "Negative case", description: "x".repeat(60),
    pricePaise: 1_000_000_00, cityId: place.city_id, areaId: place.area_id,
    stateId: place.state_id, districtId: place.district_id, talukaId: place.taluka_id,
    attributes: { bhk: "2", builtup_area: { value: "900", unit: "sqft" } },
    contactPublic: false, photoCount: 0,
  };

  let r = await api(u.phone, "/api/v1/listings", { method: "POST", body: { ...base, pincode: null } });
  check(r.status === 422 && r.error?.errors?.pincode, "pincode is required", JSON.stringify(r.error).slice(0, 200));

  r = await api(u.phone, "/api/v1/listings", { method: "POST", body: { ...base, pincode: "0123" } });
  check(r.status === 422 && r.error?.errors?.pincode, "short pincode rejected");

  r = await api(u.phone, "/api/v1/listings", { method: "POST", body: { ...base, pincode: "012345" } });
  check(r.status === 422 && r.error?.errors?.pincode, "pincode starting with 0 rejected");

  r = await api(u.phone, "/api/v1/listings", { method: "POST", body: { ...base, pincode: PINCODE, attributes: {} } });
  check(r.status === 422 && r.error?.errors?.bhk && r.error?.errors?.builtup_area,
    "required attributes are enforced per type", JSON.stringify(r.error?.errors ?? {}).slice(0, 200));

  r = await api(u.phone, "/api/v1/listings", { method: "POST", body: { ...base, pincode: PINCODE, cityId: null } });
  check(r.status === 422 && r.error?.errors?.city, "city is required");

  r = await api(u.phone, "/api/v1/listings", { method: "POST", body: { ...base, typeCode: "plot_res", kind: "rent", pincode: PINCODE, attributes: { land_area: { value: "5", unit: "guntha" } } } });
  check(r.status === 422 && r.error?.errors?.kind, "a plot cannot be listed for rent", JSON.stringify(r.error?.errors ?? {}).slice(0, 200));
}

// ---- projects: every scheme type, one by one --------------------------------
// The project form had no type at all until migration 0062 — a plotting scheme
// and an apartment tower filled in the identical five steps. This walks all
// eight, fills what each one asks for, and reads the row back out of Postgres.
head("PROJECT TYPES");
const createdProjects = [];
{
  const b = USERS[2]; // builder — projects are Builder-only (Doc2 §6)
  const cfg = await api(b.phone, "/api/v1/listings/config");
  const { projectTypes, fieldDefs } = cfg.data ?? {};
  check(projectTypes?.length === 8, "all 8 project types are served", `got ${projectTypes?.length}`);

  // An Owner must not even receive the list.
  const ownerCfg = await api(USERS[0].phone, "/api/v1/listings/config");
  check((ownerCfg.data?.projectTypes ?? []).length === 0, "an owner is served no project types");

  for (const t of projectTypes ?? []) {
    const label = `project/${t.code}`;
    check(t.unitTypes?.length > 0, `${label}: has its own unit names`, JSON.stringify(t.unitTypes));

    // Fill everything the scheme asks for, hidden fields included — same trick
    // as the listing walk: the server has to drop what isn't visible.
    const values = {};
    for (const k of t.fields) if (fieldDefs[k]) values[k] = valueFor(fieldDefs[k], true);
    // `build_status` is a COLUMN, not a scheme field (migration 0064), so it
    // drives visibility from OUTSIDE the attribute bag.
    const buildStatus = "under_construction";
    check(!t.fields.includes("build_status"), `${label}: build_status is not a scheme field`);
    const shown = visibleKeys(t.fields.filter((k) => fieldDefs[k]), fieldDefs, { ...values, build_status: buildStatus });
    const hidden = t.fields.filter((k) => fieldDefs[k] && !shown.includes(k));

    const r = await api(b.phone, "/api/v1/projects", {
      method: "POST",
      body: {
        name: `Test ${t.label}`,
        projectType: t.code,
        buildStatus,
        possessionDate: "2027-06-01",
        reraNumber: "PR/GJ/RAJKOT/TEST/001",
        reraExempt: false,
        towers: 3, floors: 12, totalUnits: 120, availableUnits: 40,
        bankApprovals: ["SBI", "HDFC"],
        amenities: ["security"],
        description: "Automated project coverage check.",
        stateId: place.state_id, districtId: place.district_id, talukaId: place.taluka_id,
        cityId: place.city_id, areaId: place.area_id,
        areaLabel: `${place.area_name}, ${place.city_name}`,
        pincode: PINCODE,
        attributes: values,
        units: [{ unitType: t.unitTypes[0], areaSqft: 1200, carpetSqft: 950, priceFromPaise: 4_500_000_00, unitsAvailable: 10 }],
      },
    });
    if (!check(r.status === 200, `${label}: created`, `status ${r.status} ${JSON.stringify(r.error ?? {}).slice(0, 240)}`)) continue;

    const id = r.data.project.id;
    createdProjects.push(id);

    const row = await one(`select project_type, attributes, build_status, possession_date, pincode, city_id from projects where id=$1`, [id]);
    check(row?.project_type === t.code, `${label}: type stored`, `got ${row?.project_type}`);
    check(row?.pincode === PINCODE && row?.city_id === place.city_id, `${label}: location + pincode stored`);

    const stored = row?.attributes ?? {};
    // `build_status` lives on its own column, so it must NOT be duplicated here.
    const expect = shown.filter((k) => k !== "build_status");
    const missing = expect.filter((k) => stored[k] === undefined);
    check(missing.length === 0, `${label}: ${expect.length} scheme fields persisted`, `missing: ${missing.join(", ")}`);
    const leaked = hidden.filter((k) => stored[k] !== undefined);
    check(leaked.length === 0, `${label}: ${hidden.length} hidden field(s) stripped`, `leaked: ${leaked.join(", ")}`);
    const foreign = Object.keys(stored).filter((k) => !t.fields.includes(k));
    check(foreign.length === 0, `${label}: no field outside this scheme's config`, `extra: ${foreign.join(", ")}`);

    // The detail payload renders labels, not codes.
    const detail = await api(b.phone, `/api/v1/projects/${id}`);
    const groups = detail.data?.project?.attributeGroups ?? [];
    const raw = groups.flatMap((g) => g.rows).filter((r) => /^[a-z0-9]+(_[a-z0-9]+)+$/.test(String(r.value)));
    check(raw.length === 0, `${label}: detail shows labels, not codes`, raw.map((r) => `${r.key}=${r.value}`).join(", "));
  }

  // A ready-to-move scheme keeps no possession date and no launch date, and
  // gains its two certificates — the same contradiction the listing form had.
  const ready = await api(b.phone, "/api/v1/projects", {
    method: "POST",
    body: {
      name: "Ready scheme", projectType: "apartment", buildStatus: "ready",
      possessionDate: "2027-06-01", reraNumber: "PR/GJ/RAJKOT/TEST/002", reraExempt: false,
      stateId: place.state_id, districtId: place.district_id, talukaId: place.taluka_id,
      cityId: place.city_id, areaId: place.area_id, pincode: PINCODE,
      attributes: { oc_received: true, bu_permission: true, launch_date: "2027-01-01" },
      units: [{ unitType: "2 BHK", areaSqft: 1000 }],
    },
  });
  if (check(ready.status === 200, "ready-to-move project created", `status ${ready.status} ${JSON.stringify(ready.error ?? {}).slice(0, 200)}`)) {
    createdProjects.push(ready.data.project.id);
    const row = await one(`select possession_date, attributes from projects where id=$1`, [ready.data.project.id]);
    check(row?.possession_date === null, "a ready project stores no possession date", String(row?.possession_date));
    check(row?.attributes?.oc_received === true, "a ready project keeps its Occupancy Certificate", JSON.stringify(row?.attributes));
    check(row?.attributes?.launch_date === undefined, "a ready project drops the launch date", JSON.stringify(row?.attributes?.launch_date));
  }

  // Negative cases the server alone can enforce.
  const baseProj = {
    name: "Bad project", buildStatus: "under_construction", reraNumber: "X", reraExempt: false,
    stateId: place.state_id, districtId: place.district_id, talukaId: place.taluka_id,
    cityId: place.city_id, areaId: place.area_id, pincode: PINCODE, units: [],
  };
  let r = await api(b.phone, "/api/v1/projects", { method: "POST", body: { ...baseProj, projectType: null } });
  check(r.status === 422 && r.error?.errors?.projectType, "project type is required", JSON.stringify(r.error ?? {}).slice(0, 160));

  r = await api(b.phone, "/api/v1/projects", { method: "POST", body: { ...baseProj, projectType: "not_a_type" } });
  check(r.status === 422, "an unknown project type is refused", `status ${r.status}`);

  r = await api(b.phone, "/api/v1/projects", { method: "POST", body: { ...baseProj, projectType: "apartment", totalUnits: 10, availableUnits: 99 } });
  check(r.status === 422 && r.error?.errors?.availableUnits, "available units cannot exceed total", JSON.stringify(r.error?.errors ?? {}).slice(0, 160));

  r = await api(b.phone, "/api/v1/projects", { method: "POST", body: { ...baseProj, projectType: "apartment", reraExempt: true, reraNumber: "", reraExemptReason: "made up reason" } });
  check(r.status === 422 && r.error?.errors?.reraExemptReason, "a free-text exemption reason is refused", JSON.stringify(r.error?.errors ?? {}).slice(0, 160));

  // Owner/Broker are refused regardless of what the UI showed them.
  r = await api(USERS[0].phone, "/api/v1/projects", { method: "POST", body: { ...baseProj, projectType: "apartment" } });
  check(r.status === 403, "an owner cannot post a project", `status ${r.status}`);
  r = await api(null, "/api/v1/projects", { method: "POST", body: { ...baseProj, projectType: "apartment" } });
  check(r.status === 401, "posting a project requires a session", `status ${r.status}`);
}

// ---- photo cap --------------------------------------------------------------
head("PHOTO CAP (server-enforced)");
if (created.length) {
  const u = USERS[0];
  const mine = await one(`select id from listings where profile_id=$1 and id = any($2::uuid[]) limit 1`, [u.id, created]);
  if (mine) {
    const files = (n) => Array.from({ length: n }, () => ({ contentType: "image/jpeg", size: 500_000 }));
    let r = await api(u.phone, `/api/v1/listings/${mine.id}/photos/presign`, { method: "POST", body: { files: files(10) } });
    check(r.status === 200 && r.data?.grants?.length === 10, "owner may presign 10 photos", `status ${r.status}`);

    r = await api(u.phone, `/api/v1/listings/${mine.id}/photos/presign`, { method: "POST", body: { files: files(11) } });
    check(r.status === 422 && r.error?.code === "PHOTO_LIMIT", "an 11th photo is refused at presign", `status ${r.status} ${JSON.stringify(r.error ?? {})}`);

    r = await api(u.phone, `/api/v1/listings/${mine.id}/photos/presign`, { method: "POST", body: { files: [{ contentType: "application/pdf", size: 1000 }] } });
    check(r.status >= 400 && r.status < 500, "a non-image is refused at presign", `status ${r.status}`);

    r = await api(u.phone, `/api/v1/listings/${mine.id}/photos/presign`, { method: "POST", body: { files: [{ contentType: "image/jpeg", size: 99_000_000 }] } });
    check(r.status >= 400 && r.status < 500, "an oversized file is refused at presign", `status ${r.status}`);

    const cap = await api(u.phone, `/api/v1/listings/${mine.id}/photos`);
    check(cap.data?.capacity?.max === 10, "owner's cap is reported as 10", JSON.stringify(cap.data?.capacity));
  }

  // A builder is uncapped (Doc2 §5.2).
  const b = USERS[2];
  const bl = await one(`select id from listings where profile_id=$1 and id = any($2::uuid[]) limit 1`, [b.id, created]);
  if (bl) {
    const cap = await api(b.phone, `/api/v1/listings/${bl.id}/photos`);
    check(cap.data?.capacity?.max === null, "builder's cap is unlimited", JSON.stringify(cap.data?.capacity));
  }
}

// ---- security sweep ---------------------------------------------------------
head("SECURITY");
{
  const victim = created[0];
  const stranger = USERS[1];

  let r = await api(null, "/api/v1/listings/config");
  check(r.status === 401, "config requires a session", `status ${r.status}`);

  r = await api(null, "/api/v1/listings", { method: "POST", body: { typeCode: "flat", kind: "sell" } });
  check(r.status === 401, "create requires a session", `status ${r.status}`);

  r = await api(null, `/api/v1/listings/${victim}/photos/presign`, { method: "POST", body: { files: [{ contentType: "image/jpeg" }] } });
  check(r.status === 401, "presign requires a session", `status ${r.status}`);

  const owned = await one(`select profile_id from listings where id=$1`, [victim]);
  if (owned.profile_id !== stranger.id) {
    r = await api(stranger.phone, `/api/v1/listings/${victim}`, { method: "PATCH", body: { title: "hijacked" } });
    check(r.status === 404, "IDOR: another user cannot edit this listing", `status ${r.status}`);

    r = await api(stranger.phone, `/api/v1/listings/${victim}/photos/presign`, { method: "POST", body: { files: [{ contentType: "image/jpeg" }] } });
    check(r.status === 404, "IDOR: another user cannot add photos here", `status ${r.status}`);

    const after = await one(`select title from listings where id=$1`, [victim]);
    check(after.title !== "hijacked", "IDOR: the row was not modified");
  }

  // Mass assignment — status/slot must be server-owned.
  const mineId = (await one(`select id from listings where profile_id=$1 and id = any($2::uuid[]) limit 1`, [USERS[0].id, created]))?.id;
  if (mineId) {
    const before = await one(`select status, slot_id from listings where id=$1`, [mineId]);
    await api(USERS[0].phone, `/api/v1/listings/${mineId}`, {
      method: "PATCH",
      body: { status: "live", slotId: null, rejectCount: 0, isLocked: false, pincode: PINCODE },
    });
    const after = await one(`select status, slot_id from listings where id=$1`, [mineId]);
    check(after.status === before.status, "mass assignment: status is not settable", `${before.status} → ${after.status}`);
    check(after.slot_id === before.slot_id, "mass assignment: slot is not settable");
  }

  // Locations are public master data, pincodes included.
  r = await api(null, `/api/v1/locations/children?level=state`);
  check(r.status === 200 && r.data.items.length === 36, "states are public and all 36 are there", `got ${r.data?.items?.length}`);

  r = await api(null, `/api/v1/locations/pincodes?city=${place.city_id}`);
  check(r.status === 200 && r.data.pincodes.length > 1, "city pincodes are served", `got ${r.data?.pincodes?.length}`);

  r = await api(null, `/api/v1/locations/children?level=area&parent=${place.city_id}&q=mav`);
  check(r.status === 200 && r.data.items.some((i) => i.name === "Mavdi"), "area search works", JSON.stringify(r.data?.items?.slice(0, 3)));
}

// ---- clean up ---------------------------------------------------------------
if (!KEEP && created.length) {
  await pgc.query(`delete from listings where id = any($1::uuid[])`, [created]);
}
if (!KEEP && createdProjects.length) {
  await pgc.query(`delete from project_units where project_id = any($1::uuid[])`, [createdProjects]);
  await pgc.query(`delete from projects where id = any($1::uuid[])`, [createdProjects]);
}
await pgc.query(`delete from user_plans where name = 'Test grant'`);

head("RESULT");
console.log(`${checks - failures}/${checks} checks passed, ${created.length} listings + ${createdProjects.length} projects created${KEEP ? " (kept)" : " (cleaned up)"}`);
if (fails.length) {
  console.log("\nFAILURES:");
  for (const f of fails) console.log("  ✗ " + f);
}
await pgc.end();
process.exit(failures ? 1 : 0);

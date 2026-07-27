/**
 * India Post / GeoNames postal directory → HomzList's five-level location tree.
 *
 * Source: GeoNames `IN.zip` (CC-BY 4.0, https://download.geonames.org/export/zip/) —
 * the India Post pincode directory with administrative levels attached:
 *
 *   country · pincode · place · admin1(state) · c1 · admin2(district) · c2 · admin3(taluka) · c3 · lat · lng · acc
 *
 * state and district map straight across. taluka, city and area do not, and the
 * three rules below are why.
 *
 * 1. TALUKA SPELLINGS. The dump is a scan of postal records, so one taluka
 *    arrives as "Kotda Sangani", "Kotda Sanghani" and "Kotda Saangani". Near
 *    spellings inside a district collapse onto the most common one, or the
 *    picker shows the same taluka three times.
 *
 * 2. THE DISTRICT'S CITY. Almost every district is named after its principal
 *    city, and that city appears as a taluka — sometimes exactly ("Rajkot"),
 *    usually with an administrative suffix ("Pune City", "Ahmadabad City",
 *    "Coimbatore North"). Those talukas ARE the city: they collapse into a
 *    single city node named after the district, and their post offices become
 *    its areas. This is what puts Mumbai, Pune, Coimbatore and Ahmedabad on the
 *    map as one findable city instead of four administrative fragments.
 *
 * 3. SUBURBS THAT LOOK LIKE TALUKAS. In the biggest metros the dump files
 *    suburbs in the taluka column ("Dadar", "Chembur", "Malad West"). A taluka
 *    whose pincodes all fall inside the city's own pincode set is one of these,
 *    and folds into the city too. Rajkot's Lodhika taluka reaches pincodes the
 *    city doesn't have, so it correctly stays a taluka.
 *
 * Everything left over is genuinely rural, and there the office name carries the
 * settlement: "<City> <Locality>" ("Gondal Bus Station") or a bare village
 * ("Kherdi"). A name is split on a settlement prefix when at least two offices
 * share that prefix; otherwise it stands alone as a village.
 */

/** Official names for the ones the dump spells loosely. */
const STATE_NAMES = {
  "Andaman & Nicobar Islands": "Andaman and Nicobar Islands",
  "Jammu & Kashmir": "Jammu and Kashmir",
  Pondicherry: "Puducherry",
};

/** Reorganised in 2019 but still filed under J&K in the dump. */
const LADAKH_DISTRICTS = new Set(["leh", "kargil"]);

/** Post-office grade markers — postal bookkeeping, not part of the place name. */
const OFFICE_SUFFIX = /\s+(?:G\.?P\.?O|H\.?O|S\.?O|B\.?O|R\.?S)\.?$/i;

/**
 * Administrative qualifiers on a taluka name. "Pune City", "Visakhapatnam
 * (Urban)" and "Madurai North" are all the taluka of Pune / Visakhapatnam /
 * Madurai; stripping these is what lets rule 2 recognise them.
 */
const ADMIN_QUALIFIER =
  /\b(city corporation|corporation|municipal|city|urban|rural|north|south|east|west|sadar|taluk|taluka|tehsil|mandal|town|nagar|jn|junction)\b/g;

/**
 * Cities the dump spells by their old name in one column and the new one in
 * another ("Bangalore North" inside district "Bengaluru"). Folded to a single
 * key so the district and its own taluka recognise each other.
 */
const CITY_ALIASES = {
  bangalore: "bengaluru", banglore: "bengaluru",
  mysore: "mysuru", belgaum: "belagavi", gulbarga: "kalaburagi",
  tumkur: "tumakuru", shimoga: "shivamogga", bijapur: "vijayapura",
  bellary: "ballari", chikmagalur: "chikkamagaluru",
  bombay: "mumbai", madras: "chennai", calcutta: "kolkata", poona: "pune",
  baroda: "vadodara", ahmadabad: "ahmedabad", trivandrum: "thiruvananthapuram",
  cochin: "kochi", pondicherry: "puducherry", gurugram: "gurgaon",
  allahabad: "prayagraj", cawnpore: "kanpur", hyd: "hyderabad",
};

/**
 * Districts that ARE a single city, where the dump's taluka column holds
 * something else entirely — Delhi files administrative zones, Hyderabad files
 * mandals, Kanpur files individual localities. None of those is a taluka a
 * seller could pick, so the whole district becomes one city.
 * Value = the city's name (the district's own name when null).
 */
const WHOLE_DISTRICT_CITIES = new Map(Object.entries({
  "Delhi|Central Delhi": null, "Delhi|East Delhi": null, "Delhi|New Delhi": null,
  "Delhi|North Delhi": null, "Delhi|North East Delhi": null, "Delhi|North West Delhi": null,
  "Delhi|South Delhi": null, "Delhi|South West Delhi": null, "Delhi|West Delhi": null,
  "Telangana|Hyderabad": "Hyderabad",
  "Uttar Pradesh|Kanpur Nagar": "Kanpur",
  "Chandigarh|Chandigarh": "Chandigarh",
}));

export function cleanPlace(raw) {
  let s = (raw ?? "").trim();
  s = s.replace(OFFICE_SUFFIX, "");
  // "Kadamtala (North And Middle Andaman)" — the bracket only disambiguates two
  // same-named offices, and the parent chain already does that job here.
  s = s.replace(/\s*\([^)]*\)\s*$/, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return titleCase(s);
}

/** The dump mixes "KOTHARIA" and "Kotharia"; the picker should not. */
export function titleCase(s) {
  return (s ?? "")
    .split(/(\s|-|\/)/)
    .map((w) =>
      /^[A-Za-z][a-z]/.test(w) || /^[\s\-/]$/.test(w)
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join("")
    // Keep the initialisms India Post actually uses.
    .replace(/\bGidc\b/g, "GIDC")
    .replace(/\bIit\b/g, "IIT")
    .replace(/\bNit\b/g, "NIT")
    .replace(/\bHal\b/g, "HAL")
    .replace(/\bDlf\b/g, "DLF")
    .replace(/\bGpo\b/g, "GPO")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Normalised name with the administrative qualifiers and old spellings taken off. */
const bare = (s) =>
  norm(s)
    .replace(ADMIN_QUALIFIER, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => CITY_ALIASES[w] ?? w)
    .join(" ");

/**
 * Parse the raw tab-separated dump. Anything without a 6-digit pincode, a state
 * or a district is dropped. `taluka` is left null when the dump says "NA" —
 * which of the rules picks it up is decided per district, below.
 */
export function parseDump(text) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const c = line.split("\t");
    const pincode = (c[1] ?? "").trim();
    if (!/^\d{6}$/.test(pincode)) continue;

    let state = (c[3] ?? "").trim();
    const district = titleCase((c[5] ?? "").trim());
    if (!state || !district) continue;
    state = STATE_NAMES[state] ?? state;
    if (state === "Jammu and Kashmir" && LADAKH_DISTRICTS.has(district.toLowerCase())) state = "Ladakh";

    const rawTaluka = (c[7] ?? "").trim();
    const taluka = !rawTaluka || rawTaluka.toUpperCase() === "NA" ? null : titleCase(rawTaluka);

    const place = cleanPlace(c[2]);
    if (!place) continue;

    out.push({ pincode, place, state, district, taluka });
  }
  return out;
}

/** Levenshtein, capped — only used to spot scanning typos in taluka names. */
function editDistance(a, b, cap = 2) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Rule 1 — canonical taluka spelling per district.
 * Returns normalised-name → display name, most common spelling winning.
 */
function canonicalTalukas(rowsOfDistrict) {
  const counts = new Map();
  for (const r of rowsOfDistrict) {
    if (!r.taluka) continue;
    const k = norm(r.taluka);
    const c = counts.get(k) ?? { display: r.taluka, n: 0 };
    c.n++;
    counts.set(k, c);
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  const canon = new Map();
  const accepted = [];
  for (const [k, v] of ordered) {
    // Short names are left alone: "Bah" and "Bar" are different talukas, but
    // "Chandwad" and "Chnadwad" are one taluka typed twice.
    const near = k.length >= 6 ? accepted.find((a) => editDistance(a, k) <= 2) : undefined;
    if (near) canon.set(k, canon.get(near));
    else { accepted.push(k); canon.set(k, v.display); }
  }
  return canon;
}

/**
 * Group the rows into the tree of
 * state → district → taluka → city → area.
 */
export function buildTree(rows) {
  const states = new Map();

  // ---- bucket by district ---------------------------------------------------
  const districts = new Map();
  for (const r of rows) {
    const key = `${r.state}\t${r.district}`;
    let g = districts.get(key);
    if (!g) districts.set(key, (g = { state: r.state, district: r.district, rows: [] }));
    g.rows.push(r);
  }

  for (const { state: stateName, district: districtName, rows: dRows } of districts.values()) {
    const canon = canonicalTalukas(dRows);
    const districtBare = bare(districtName);

    // ---- rule 2: which talukas are the district's own city? -----------------
    const byTaluka = new Map(); // canonical display (or null for "NA") → rows
    for (const r of dRows) {
      const name = r.taluka ? canon.get(norm(r.taluka)) : null;
      let list = byTaluka.get(name);
      if (!list) byTaluka.set(name, (list = []));
      list.push(r);
    }

    // A near-miss counts: the dump writes "Ahmadabad City" inside district
    // "Ahmedabad", and the two must recognise each other.
    const forcedName = WHOLE_DISTRICT_CITIES.get(`${stateName}|${districtName}`);
    const forced = forcedName !== undefined;
    const cityTalukas = forced
      ? [...byTaluka.keys()].filter((n) => n !== null)
      : [...byTaluka.keys()].filter((n) => n && nearlyEqual(bare(n), districtBare));
    const hasCity = forced || cityTalukas.length > 0;
    const cityName = forcedName ?? districtName;

    const cityRows = [];
    for (const n of cityTalukas) cityRows.push(...byTaluka.get(n));
    // Rows the dump couldn't place join the city when there is one — they are
    // district-level entries, and a taluka called "NA" is not a place a user can
    // pick. With no city they fall through to the rural path under a taluka
    // named after the district.
    if (hasCity && byTaluka.has(null)) cityRows.push(...byTaluka.get(null));

    const cityPincodes = new Set(cityRows.map((r) => r.pincode));

    // ---- rule 3: suburbs filed as talukas ------------------------------------
    const suburbs = [];
    if (hasCity) {
      for (const [n, list] of byTaluka) {
        if (n === null || cityTalukas.includes(n)) continue;
        if (list.every((r) => cityPincodes.has(r.pincode))) suburbs.push(n);
      }
    }

    // ---- write the tree -----------------------------------------------------
    const state = upsert(states, stateName, () => ({ name: stateName, districts: new Map() }));
    const district = upsert(state.districts, districtName, () => ({ name: districtName, talukas: new Map() }));

    if (hasCity) {
      const taluka = upsert(district.talukas, cityName, () => ({ name: cityName, cities: new Map() }));
      const city = upsert(taluka.cities, cityName, () => ({ name: cityName, areas: new Map(), pincodes: new Set() }));
      const all = [...cityRows];
      for (const n of suburbs) all.push(...byTaluka.get(n));
      for (const r of all) {
        city.pincodes.add(r.pincode);
        // "Rajkot Race Course Road" → "Race Course Road": the city is already
        // the parent, repeating it in every area name is noise.
        const areaName = stripPrefix(r.place, cityName) ?? stripPrefix(r.place, districtName) ?? r.place;
        // An office named for the city itself names no locality.
        if (bare(areaName) === bare(cityName)) continue;
        const area = upsert(city.areas, areaName, () => ({ name: areaName, pincodes: new Set() }));
        area.pincodes.add(r.pincode);
      }
    }

    // ---- everything else is rural: split places on settlement prefixes -------
    for (const [talukaName, list] of byTaluka) {
      if (hasCity && (talukaName === null || cityTalukas.includes(talukaName) || suburbs.includes(talukaName))) continue;
      const name = talukaName ?? districtName;
      const taluka = upsert(district.talukas, name, () => ({ name, cities: new Map() }));
      addRuralPlaces(taluka, name, list);
    }
  }

  return states;
}

/**
 * Split a rural taluka's post offices into cities/villages and their areas.
 *
 * The taluka's own name always counts as a settlement (a taluka is named after
 * its headquarters town). Any other prefix needs at least two offices carrying
 * it, so a one-off "Anand Nagar" doesn't invent a city called "Anand".
 */
function addRuralPlaces(taluka, talukaName, list) {
  const prefixCount = new Map();
  for (const r of list) {
    const words = r.place.split(" ");
    for (let n = 1; n <= Math.min(3, words.length - 1); n++) {
      const p = norm(words.slice(0, n).join(" "));
      prefixCount.set(p, (prefixCount.get(p) ?? 0) + 1);
    }
  }

  const settlements = new Map(); // normalised → display
  const addSettlement = (display) => {
    const k = norm(display);
    if (k && !settlements.has(k)) settlements.set(k, display);
  };
  addSettlement(talukaName);
  for (const r of list) {
    const words = r.place.split(" ");
    for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
      const p = words.slice(0, n).join(" ");
      if ((prefixCount.get(norm(p)) ?? 0) >= 2) { addSettlement(p); break; }
    }
  }

  for (const r of list) {
    let cityName = r.place;
    let areaName = null;
    const words = r.place.split(" ");
    for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
      const p = words.slice(0, n).join(" ");
      const hit = settlements.get(norm(p));
      if (hit) { cityName = hit; areaName = words.slice(n).join(" "); break; }
    }

    const city = upsert(taluka.cities, cityName, () => ({ name: cityName, areas: new Map(), pincodes: new Set() }));
    city.pincodes.add(r.pincode);
    if (areaName) {
      const area = upsert(city.areas, areaName, () => ({ name: areaName, pincodes: new Set() }));
      area.pincodes.add(r.pincode);
    }
  }
}

/** Equal, or one scanning typo apart, once both names are ≥6 characters. */
function nearlyEqual(a, b) {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6) return false;
  return editDistance(a, b, 2) <= 2;
}

/** "Rajkot Mochi Bazar" minus "Rajkot" → "Mochi Bazar"; null if not prefixed. */
function stripPrefix(place, prefix) {
  const pw = prefix.split(" ").length;
  const w = place.split(" ");
  if (norm(w.slice(0, pw).join(" ")) !== norm(prefix)) return null;
  return w.slice(pw).join(" ").trim() || null;
}

function upsert(map, key, make) {
  let v = map.get(key);
  if (!v) map.set(key, (v = make()));
  return v;
}

/** Flat counts, for the seed script's report. */
export function countTree(states) {
  let d = 0, t = 0, c = 0, a = 0;
  const p = new Set();
  for (const s of states.values()) {
    for (const dd of s.districts.values()) {
      d++;
      for (const tt of dd.talukas.values()) {
        t++;
        for (const cc of tt.cities.values()) {
          c++;
          cc.pincodes.forEach((x) => p.add(x));
          a += cc.areas.size;
        }
      }
    }
  }
  return { states: states.size, districts: d, talukas: t, cities: c, areas: a, pincodes: p.size };
}

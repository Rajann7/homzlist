# Search / Results (Explore) — Specification

> The discovery core of **Homzlist** — where users search and browse **live** property & project listings. **List / grid card feed, NO maps** (locality-based). Location-first search + autocomplete + **dynamic filters** (create-listing taxonomy) + sort + **boost-aware, honest ranking**. **Guests browse fully** (public numbers on the view screen); **save / inquire / save-search are login-gated**. **Saved-search alerts** + **SEO-friendly result URLs** drive retention & organic traffic. Internal search over own data (near-zero-cost, no paid API). INR (Lakh / Cr) · PWA · EN / GU / HI · "Made in India".

---

## 1. Purpose & Scope
- Search + browse + filter + sort **LIVE** property & project listings; open to guests.
- **In scope:** search input + autocomplete; dynamic filters; sort + boost-aware ranking; results feed + cards; saved-search alerts (entry); SEO result URLs; no-result recovery; guest gating; responsive / PWA / i18n; states.
- **Out of scope (elsewhere):** the card's origin spec (defined once, reused); the **view screen** (detail / contact / inquiry); **recently-viewed listings** (separate feature); the **saved-searches management** surface (created here, managed elsewhere); **maps** (product-wide none).
- **Only LIVE listings appear.**

---

## 2. Search Input
- Search bar accepts: **locality · city · project name · builder · reference ID (PROP / PROJ) · free keyword.**
- **Location-first:** city → locality / area (multi-select); popular / trending areas surfaced.
- **Autocomplete / suggestions** as-you-type (localities · projects · builders).
- **Lightweight query parsing** — e.g. "2 BHK Vastrapur under 50L" maps into filters where possible.
- **Recent searches** (query history, lightweight). *(Recently-viewed listings = separate feature, not here.)*

---

## 3. Filters (create-listing taxonomy · dynamic per type)
- **Buy / Rent** — top-level toggle.
- **All / Properties / Projects** — feed scope.
- **Category:** Residential (apartment / villa / house) · Commercial · Plot / Land · PG.
- **Budget / price range** (Lakh / Cr).
- **BHK / configuration** · **area** (carpet / built-up range) · **furnishing**.
- **Amenities** (multi) · **possession** (ready / under-construction; project launch-status).
- **Location:** city + locality (multi).
- **Trust:** RERA-verified · **verified poster** (ID / Business / RERA tier) · **No Brokerage** · **posted-by** (owner / broker / builder).
- **Freshness:** newly added.
- **Dynamic** — the filter set adapts to the chosen category (Plot has no BHK; PG shows occupancy / gender).
- **Applied filters = removable chips** + filter-count badge; **last-used filters & sort persist**.

---

## 4. Sort & Ranking (boost-aware, honest)
- **Sort:** Relevance (default) · Newest · Price low→high · Price high→low · Recently updated.
- **Relevance signals:** location / filter match + freshness + listing completeness + verified tier (light) — **merit-based**.
- **Boost** (boost spec): boosted listings get **top placement + light interspersing**, always with a clear **"Boosted" tag**; among themselves ordered by **recency**; **capped per page** so organic results stay prominent.
- **Boost never fakes organic relevance** — it's labeled placement, not a ranking trick.

---

## 5. Results Feed & Card
- **Standard reusable card:**
  - *Property:* cover · Sale / Rent tag · **price** · locality + city · one primary spec (Residential: BHK + carpet · Plot: area · Commercial: built-up + type · PG: occupancy + gender) · **verified / RERA tier badge** · **Boosted tag**.
  - *Project:* cover · project name · builder · **status badge** · price range · locality + city · RERA-Verified.
- **Only LIVE** (sold / hidden / paused / expired excluded).
- **Result count** · applied-filter chips.
- **Progressive / paginated loading**, fixed **anti-gap card skeleton**, branded placeholder, **no layout shift**.
- **No map** — pure list / grid.

---

## 6. Card Actions
- **Save / heart** — **login-gated** (guest → login sheet); **syncs across all surfaces**.
- **Tap card → view (detail) screen.**
- **Contact** (call / WhatsApp / inquire) happens on the **view screen** (public numbers shown to guests there); **inquire = Buyer / Broker only** (Builder can't).

---

## 7. Guest vs Logged-in
- **Guest:** full search / browse; public numbers on the view screen; **save / inquire / save-search → login gate**.
- **Logged-in:** full + saved hearts synced + saved-search alerts.

---

## 8. Saved Searches & Alerts (retention)
- **"Save this search"** — stores the current **filters + location** as a named search.
- **Alert:** when a **NEW matching listing goes live** → notification (in-app + browser + email per the engine), **deep-linking** to the results / item.
- **Throttled / batched**; managing saved searches is a **separate surface** — this screen **creates** them.

---

## 9. No-Result Recovery
- No results → **broaden suggestions:** clear filters · nearby localities · relax budget / BHK.
- Zero in an area → suggest **popular nearby areas**.
- Offer **"Save this search"** to be alerted when something matches.
- **Never a dead blank.**

---

## 10. SEO & Shareable URLs (organic traffic)
- Filter / location combos map to **clean canonical URLs** (e.g. `/property-for-sale-in-<city>-<locality>`, `/<n>-bhk-flats-in-<locality>`).
- Per-combo **meta title / description** + OG preview; pagination canonicalization.
- **Shareable result links.**

---

## 11. Location Handling (no maps)
- **Locality hierarchy:** city → area → sub-locality (multi-select); popular / trending areas.
- Text nearby-landmarks on cards where available.
- **No radius / map search.**

---

## 12. Responsive, Performance, PWA, i18n
- **3 layouts:** mobile single-column + chip filters + filter sheet · tablet 2-col + filter drawer · desktop 3–4-col + left filter rail.
- **Debounced** search; progressive / paginated loading; skeletons; branded placeholders; **no layout shift**.
- **PWA:** last results viewable **offline** ("offline — last updated …").
- **EN / GU / HI**; INR (Lakh / Cr); India.
- **Near-zero-cost:** internal search over own data (no paid search API).

---

## 13. Data & States
- **Screen states:** loading · loaded · empty (no-result) · filtered-empty · offline · error.
- **Per result:** card data + save state + verified tier + boosted flag.
- **Persisted:** last-used filters / sort; saved searches (per account).

---

## 14. Rules & Edge Cases
- **Only LIVE** listings appear; non-live never shown here.
- **Boost = labeled placement, capped, never fakes relevance.**
- Guest browses; **save / inquire / save-search login-gated**.
- **Inquire = Buyer / Broker only** (Builder can't).
- No maps; INR; locality-based; near-zero-cost internal search.
- **Recently-viewed listings & saved-search management = separate features.**

---

## 15. Excluded from this Screen
- **Maps / radius search.**
- **Recently-viewed listings.**
- **Contact / inquiry flow** (view screen).
- **Saved-searches management** surface (created here, managed elsewhere).
- No EMI / loan widget; no public view / save counters.

---

## 16. Cross-screen Consistency
- **Card** ↔ card spec (view / saved / home).
- **Save / heart & login gate** ↔ saved screen + login sheet.
- **Boost ranking / tag** ↔ boost spec (labeled, recency among boosted, no relevance-faking).
- **Verified tier badge** ↔ verification (ID / Business / RERA).
- **Inquire rules** ↔ leads / view (Buyer / Broker send; Builder can't).
- **Taxonomy** ↔ create-listing.
- **Saved-search alerts** ↔ notification engine.
- **No-maps / INR / PWA / EN-GU-HI** ↔ product-wide.

---

## 17. Referenced Screens (defined elsewhere)
- **listing view** (detail, contact, inquiry) · **saved** (heart collection) · **create-listing** (taxonomy, card fields) · **boost** (ranking / tag) · **verification** (tier badges) · **notification engine** (saved-search alerts) · **login / register** (auth gate, guest merge) · **home** (card spec, nav).

# My Project + Inventory (Developer / Builder) — Specification  *(final audit, product-ready)*

> The developer/builder's screen to manage **ONE project end-to-end** — its **phases, stage, configurations, RERA, documents, media**, and above all its **(phase →) tower → wing → floor → unit INVENTORY** with **live availability**. The builder's daily operational surface: build inventory once, then mark units Available / Booked / Sold at scale and keep the public project accurate. **My Listings** is the *list* of projects; **this screen manages one project in depth**; **create-listing** owns field-by-field entry. Owner-only, login required.
>
> **Locked rules:** **availability-only unit updates are INSTANT (no re-approval); every content edit is a pending revision while the live project keeps serving (L1/L3); unit price is content → revision (NOT instant).** **This is an availability *display* the builder maintains — NOT an online booking/transaction engine; bookings happen offline, so there is no buyer-side double-booking.** **No maps, no view counts** (product exclusions). RERA (GujRERA) · INR (Lakh/Cr) · PWA · "Made in India".

---

## 1. Purpose & Scope
- Manage a single project's **content** (phases/stage · configs · RERA · docs · media · amenities/specs/payment-plan/approvals) and its **inventory** (structure + per-unit availability).
- **In scope:** header/rollups · phase & stage · configs & price model · the **inventory engine** (structure, grid+list, availability, bulk, undo, offline, import/export, generator) · public-exposure control · RERA/docs/media · leads (link-out) · boost/plan status · edit lanes · data integrity · activity log · notifications · states · a11y · responsive · scale.
- **Out of scope (owned elsewhere):** field-by-field create/edit form (create-listing) · lead pipeline/detail (Leads) · boost buy/manage (Boost) · payment/plans (Payment) · public detail (view screen) · analytics/view counts (not in product).
- **Not a booking system:** no online booking, payment, or reservation by buyers here — the builder records status; inquiries stay project-level.
- **Owner-only** — auth-scoped to the owning builder.

---

## 2. Access & Entry
- From **My Listings** → tap a project → **Manage**; from the **builder dashboard**; **deep-link from notifications**; sub-area deep-links (a tower/phase) for quick return.

---

## 3. Project Header & Rollups
- **Name · PROJ-XXXXX · builder · stage badge · status · RERA-per-phase status · location (text) · plan/expiry · boost status · lead count (total+new).**
- **Inventory summary:** total units + **Available / Booked / Sold counts & %** (project-wide), with drill-down rollups per phase/tower/wing/config.
- **Header actions:** Edit · View public (owner view) · Share (link+QR) · Boost (Live only) · project status change (Pause/Withdraw/Sold-out).

---

## 4. Phase, Stage & Construction Status
- **Phases:** a project can have **multiple phases**, each with its **own RERA number** and its **own inventory** (towers). The hierarchy supports an optional **Phase** level above Tower (§6). Adding a phase = content → revision + RERA validation.
- **Stage:** Upcoming → Pre-Launch → New Launch → Under Construction → Ready to Move (drives fields); changing stage = content → revision.
- **Per-tower / per-phase construction status** — towers can differ (Tower A "Ready", Tower B "Under Construction"); shown on the tower and reflected publicly. Possession/timeline per phase/tower.

---

## 5. Configurations & Price Model
- **Config:** type (e.g. 2BHK) · carpet / built-up / super area · size · **price range** · floor-plan image · availability count (rolled up from its units). Add/edit/remove config = content → revision.
- **Price model (finalized):** a unit inherits its **config price range** by default; an **optional per-unit price** may override it. **Price on request** hides the amount (public shows "Price on request"); **price/sq.ft** derived. **Any price change (config or unit) = content → revision** (only *availability* is the instant lane, §10) — price is buyer-facing content.
- **Public price granularity** is governed by the exposure control (§11).

---

## 6. Inventory Engine — the core
### 6.1 Hierarchy & unit model
- **Project → (Phase) → Tower → Wing → Floor → Unit.**
- **Unit:** unit no. · phase/tower/wing/floor · **config/type** · area · facing (optional) · price (config-inherited or unit override) · **status**.
- **Statuses:** **Available · Booked · Sold** (core). *Phase-2 optional:* **Hold / Blocked** (temporary, auto-expiring).

### 6.2 Views
- **Grid / matrix (primary):** floors × units, **colour + icon** coded by status — scan a whole wing, update fast.
- **List / table:** filterable unit rows.
- **Navigator:** Phase → Tower → Wing → floor–unit grid; **per-tower lazy load** for scale.
- **Grid states:** skeleton while a tower loads; partial-load (some towers ready, others loading); per-tower error + retry.

### 6.3 Search, filter, legend, rollups
- **Filter/search units:** status · config · floor range · phase/tower/wing · facing · price.
- **Legend:** icon + text + colour (never colour alone).
- **Rollups:** live Available/Booked/Sold counts + % at unit → floor → wing → tower → phase → config → project.

---

## 7. Structure Builder / Inventory Generator
- A **guided generator** to create inventory without hand-entering every unit: define **phase → tower(s) → floors per tower → units per floor**, and a **naming pattern** (e.g. A-101, A-102…) + **config assignment** (per floor / per column / mixed).
- **Preview the generated structure** → confirm → creates the units. Generated/new structure = content → revision.
- Complements CSV import (§8) for builders who prefer a UI over a spreadsheet.

---

## 8. Bulk Import / Export
- **Import (CSV / Excel):** a provided **template** (phase · tower · wing · floor · unit · config · area · price · status) with **column mapping**; **validate → preview (error rows flagged) → apply**. Client/server CSV — **no paid API**.
- **Partial-apply policy:** valid rows can be applied while invalid rows are reported for fixing (chosen over all-or-nothing so a few bad rows don't block a large upload); a summary shows applied / skipped / errored.
- **Idempotent by unit key** (phase/tower/wing/floor/unit) — re-import **updates**, never duplicates; **availability columns on re-import of existing units update instantly**, new structure = revision.
- **Caps & validation:** sane max rows per import; type/area/price/status validation; unknown config rejected with a clear message.
- **Export (CSV):** full current inventory + statuses any time (for records / sales team).

---

## 9. Availability Lane — Instant, Bulk, Undo & Offline
- **Instant (no re-approval, L3):** tap a unit → **Available / Booked / Sold** (/ Hold); or **bulk** a floor / wing / tower / phase / config in one action. Applies immediately; **reflects on the public live project** (subject to §11).
- **Bulk undo / snapshot:** before any bulk availability action a **snapshot** is taken → **one-tap Undo within a window**; guards a mis-click across a tower.
- **Correction allowed** (e.g. Sold → Available) with **reason + audit** — no silent reversals.
- **Offline (PWA):** on-site with no signal, **availability edits are queued locally and synced on reconnect** (optimistic; reconciled last-write-wins). Content edits are not offline.

---

## 10. Edit Lanes — Instant vs Pending Revision (the crux)
| Change | Lane | Public effect |
|---|---|---|
| Existing unit **availability** (single or bulk) | **INSTANT** — no re-approval | Reflects immediately (per §11) |
| Add/remove phase·tower·wing·floor·unit | **Pending revision** (live stays public, L1) | Applies on approval |
| Unit/config **price**, area, config, facing | **Pending revision** | Applies on approval |
| Stage · RERA · docs · media · amenities/specs/payment-plan/approvals · description | **Pending revision** | Applies on approval |
- **Lanes are independent:** a content revision under admin review does **not** block instant availability edits.
- During a revision the **live project keeps serving** and **boost keeps running** (L1); header shows **"Edit pending review"**; approve → replaces live, reject → live untouched + reason.

---

## 11. Public Inventory Visibility Control (builder-set)
- The builder chooses **how much inventory the public sees**, per project: **(a) full unit grid** (tower/wing/floor/unit Available/Booked/Sold), **(b) config-level availability summary only** (e.g. "2BHK: 6 available"), or **(c) hidden** (no public availability).
- **Recommended default = full grid** (honours the view-screen §8 inventory display); a builder who prefers not to expose exact unit-level status can dial down to summary or hidden.
- The **view screen honours this setting**; internal management always shows full detail regardless.

---

## 12. RERA, Documents, Media & Fields
- **RERA (per phase):** multiple numbers; **GujRERA validation** → Verified / Not-applicable / Expired; portal link; **missing/expired → Needs-Attention**. Edit = content → revision.
- **Documents:** brochure PDF · price-list PDF · approvals / bank-approvals / clearances — upload/replace (content → revision). If a **price-list PDF** and live prices diverge, the **live listing prices are authoritative** for the public view.
- **Media:** gallery (max 15, cover required, floor-plans, categories, auto-watermark) — managed in summary, edited via create-listing (content → revision).
- **Other fields:** amenities · specifications · payment plan · bank approvals · approvals & clearances — content → revision.

---

## 13. Project-Level Status & Lifecycle
- **Pause / Withdraw / Resume** (pause ≤30d no re-approval, >30d re-approval).
- **Sold-out** — mark the whole project closed (auto-suggested when all units are Sold); hides from public, **retains leads**, boost expires (no refund, not reusable).
- **Relist / Renew** (Expired) → Payment (new plan) → re-approval.
- **Delete** → soft-delete to Trash + recovery window, then removes project **and its leads** (hard confirm) — consistent with My Listings §18. **Account deletion** removes the builder's projects + leads (edit-profile §5.4).

---

## 14. Leads on the Project (link-out, not the pipeline)
- **Project-level lead count (total + new)** → tap → **Leads screen** for this project. Inquiries are **project-level** (no unit selection in the inquiry form) → **no per-unit leads**; this screen shows the count + doorway only.

---

## 15. Boost / Plan / Slot (display + route-out)
- **Boost status** (active · days-left · leads-during-boost) + Boosted tag; **reusable boost** surfaces; **Live-only boostable** → Boost screen.
- **Plan/expiry**; **relist/renew / buy plan** → Payment (payment-first). Management on their screens — here: status + link-in.

---

## 16. Activity / History Log (per project)
- Read-only **timeline**: created · approved · **stage/phase changes** · config edits · **inventory changes** ("Tower A: 20 units → Sold", actor + when + scope) · **bulk actions + undos** · RERA updates · revisions submitted/approved/rejected (reason) · imports (applied/skipped counts) · boost start/end · restored-from-trash.
- **Inventory change log is first-class** — essential when a sales team updates units. Sourced from the **event bus** (near-zero-cost).

---

## 17. Data Integrity & Validation
- **Unit-key uniqueness** (phase/tower/wing/floor/unit); duplicates blocked / de-duped on import.
- **Config existence** — a unit must reference an existing config; **removing a config in use is blocked** until its units are reassigned.
- **Range/sanity checks** — floor within the tower's floor count; area/price non-negative & sane; status ∈ allowed set.
- **Deletion** of a unit/floor/wing/tower/phase = content → revision + confirm; **a Sold unit's record is retained in audit** even if the structure is later removed.
- **Import validation** mirrors the same rules with per-row error reporting (§8).

---

## 18. Notifications (this screen's events)
- Reuses the notification engine: **revision approved / rejected (reason)** · **RERA expiring / expired** · **project expiring / expired** · **lead received** (→ Leads) · optional **low-availability alert** ("only N units left in <config>"). Channels per the matrix (in-app + browser; email for the main set); deep-link back here or to the project.

---

## 19. Real-time & Sync
- **Inventory updates near-real-time**; unit edits reconcile **last-write-wins** + re-validate (guards two-device / team races); rollups recompute live; availability **propagates to the public view** promptly for Live projects (as of last update — not a live transactional lock, since it's a display, not a booking engine).
- **Multi-device / app↔browser** consistent; offline availability edits reconcile on reconnect (§9).

---

## 20. Empty, Loading & Error States
- **No inventory yet** → prompt to **use the Structure Builder** or **import CSV**; never a blank grid.
- **New project (Draft/Pending)** → build inventory + content before/awaiting approval (part of first approval).
- **Grid loading** = skeleton; **partial** = some towers ready; **error** = per-tower retry. Per-section empty (no docs/RERA) → scoped prompts.

---

## 21. Responsive (3 distinct views)
- **Desktop** — the **full inventory grid/matrix** (floors × units), multi-select, bulk toolbar, side rollups, generator, import/export — the primary builder surface.
- **Tablet** — condensed per-wing grid + filter drawer + quick bulk.
- **Mobile** — **floor-by-floor / list** with **fast per-unit status toggles** (matrix impractical on a phone); phase/tower/wing picker; quick "mark sold/booked".

---

## 22. Accessibility & Localization
- **Unit status = colour + icon + text**; grid is **keyboard-navigable** with visible focus; screen readers get **grid summaries** ("Tower A, Floor 3: 4 units — 2 available, 1 booked, 1 sold") rather than raw cells; bulk/destructive actions confirm; focus returns after sheets.
- **IST** dates; **EN / GU / HI** copy; Indian numbering (Lakh/Cr); area units consistent (sqft/sqm/sq.yd).

---

## 23. Performance & Scale
- **Virtualized grid** + **per-tower lazy load**; server-side filter/search; **efficient rollups** (aggregate counts, not per-unit render fetch); bulk/import processed server-side with progress; fixed skeletons avoid layout shift; sane soft caps on towers/units per project.

---

## 24. Security & Privacy
- **Owner-only, auth-scoped** — a builder manages only their own project/inventory/trash.
- Inventory/documents are the builder's data; leads shown are counts only.
- Money actions route through the secured Payment flow; public exposure limited to the §11 setting.

---

## 25. Rules & Edge Cases
- **Availability = instant; everything else (incl. price) = pending revision** (§10) — the governing rule.
- **Public reflects only a Live project's** availability, at the chosen granularity (§11); non-live projects update privately.
- **Sold → Available correction** allowed with reason + audit; **bulk actions are undoable** within a window (§9).
- **Fully-sold** → prompt Sold-out; leads retained.
- **New phase = new inventory + new RERA** → revision + RERA validation.
- **Config removal blocked while units reference it**; unit-key unique; import de-dupes.
- **Concurrent team edits** → last-write-wins + re-validate; a content revision under review never blocks the availability lane.
- **Not a booking engine** — no buyer-side reservation/double-booking; the builder is the source of truth.
- **No map · no view count · price in Lakh/Cr · EN/GU/HI.**

---

## 26. Optional / Phase-2 (droppable)
- **Team / sub-user access** — builder company grants sales staff scoped rights (e.g. availability-only), per-user audit. (Current auth is single-account.)
- **Hold / Blocked** interim unit status with auto-expiry.
- **Per-unit price-override UI**, **saved grid filters**, **unit tagging** (corner/park-facing/vaastu), **PDF inventory snapshot** export, **inventory snapshot/versioning** for phase launches.

---

## 27. Excluded from this Screen
- Field-by-field **create/edit form** (create-listing) — here: manage + the inventory engine.
- **Lead pipeline & detail** (Leads) · **boost purchase/management** (Boost) · **payment/plans** (Payment) · **public project detail** (view screen).
- **View counts, conversion analytics, map** — not in the product.
- **Per-unit inquiries / online booking** — inquiries are project-level; no buyer booking.

---

## 28. Cross-screen Consistency
- **My Listings** → the list; this screen is its per-project deep manage; shared statuses/lifecycle.
- **create-listing** → source of config/inventory/RERA/media fields; **content = pending revision (L1)**, **availability-only = instant (L3)**, **price = revision**.
- **view screen** → renders the public inventory at the granularity set in §11 (refines view §8).
- **Boost** → boost §7–8 (only-Live boostable, sold expires no-refund, admin-reject reusable; boost keeps running during an edit-revision).
- **Payment** → payment-first relist/renew/boost; **slot preserved on admin rejection**.
- **Leads** → project-level counts here, pipeline there.
- **Notifications** → revision/RERA/expiry/lead events deep-link here or to the project.

---

## 29. Referenced Screens (defined elsewhere)
- **My Listings** · **create-listing (edit + inventory fields)** · **listing view / detail** (public project, owner view) · **Leads / Inquiry** · **Boost** · **Payment / plans** · **Notifications** · **Edit Profile** (verification badge, account deletion) · **admin** (approval / rejection / RERA / removal that drives statuses).

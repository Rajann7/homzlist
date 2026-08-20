# My Listings (Property / Project) — Specification  *(final, production-ready)*

> The poster's **management hub** for **all their own listings**, across **every status** — Draft, Pending, Live, Rejected, Under Re-review, Paused, Sold/Rented, Expired, Withdrawn. **Buyer / Broker** manage **Properties** (PROP-XXXXX); **Developer / Builder** manage **Projects** (PROJ-XXXXX) — same screen, role-appropriate. It owns the **listing lifecycle** (edit · status change · boost entry · relist/renew · delete/restore) and shows **plan/slot & boost status**, **compliance flags**, a **Needs-Attention** group, a per-listing **activity history**, and **at-a-glance lead counts**. **Management-first:** the **lead pipeline** lives on the **Leads screen** (here: counts + link), **boost buy/manage** on the **Boost screen**, **editing/inventory** on **create-listing**, **payment** on the **Payment screen**. Owner-only, login required. **No view counts, no conversion analytics, no map** (product exclusions). INR (Lakh/Cr) · PWA · "Made in India".
>
> **Locked behaviours (finalized this version):** **(L1) Edit keeps the listing live** — editing a Live listing keeps the current version public while the edit is reviewed as a pending revision; boost keeps running (§11). **(L2) Slot lifecycle** — consumed at publish, not returned on user delete/sold/expired, **preserved/reusable on admin rejection** (§12). **(L3) Project inventory** — availability-only unit updates skip full re-approval; content edits re-approve (§15).

---

## 1. Purpose & Scope
- One place to **see, organize, and manage every listing the user has posted**, at any life stage.
- **In scope:** status model & badges · Needs-Attention · overview strip · tabs / filter / search / sort · management card/row · per-listing lifecycle actions · edit-revision & re-approval visibility · slot & boost status · compliance flags · lead-count link-out · drafts/rejected/expiry · activity history · trash/restore · bulk · real-time sync · a11y · responsive views · states.
- **Out of scope (owned elsewhere, referenced):** lead pipeline & detail (Leads); boost buy/manage (Boost); create/edit form & project inventory editing (create-listing); public detail (view); payment/plans (Payment); analytics/view counts (not in product).
- **Owner-only** — auth-scoped; a user manages only their own listings.

---

## 2. Role & Scope
- **Buyer / Broker →** Properties. **Developer / Builder →** Projects. One fixed role → one entity type, role-appropriate labels ("My Properties" / "My Projects").
- **Project cards** carry stage + config + RERA; **property cards** carry property specifics; the **management chrome (status · actions · plan · boost · leads · compliance) is identical**.
- Never-posted seeker → **first-time empty state** (§22).

---

## 3. Entry Points
- **Bottom nav / profile** → "My Listings".
- **After publishing** (post → payment → create → submit) → lands here to track approval.
- **Deep-link from notifications** — `listing.approved/rejected/changes_requested/expiring_soon/expired`, `lead.received`.
- From the **home dashboard** supply-side summary.

---

## 4. Status Model (backbone) + valid-transition integrity
| Status | Set by | Public? | Meaning / next |
|---|---|---|---|
| **Draft** | user (autosaved) | No | Incomplete; Continue editing. **No slot** until published. |
| **Pending Approval** | system | No | **First-time** submission awaiting admin (no live version yet). |
| **Live** | admin (approved) | **Yes** | Public & actionable; boostable. |
| **Rejected** | admin (reason) | No | Fix & resubmit → Pending. |
| **Under Re-review** | system (after an edit to a Live listing) | **Yes — the live version stays public**; the **pending revision** is what's reviewed (§11). | Approve → revision replaces live; reject → live untouched + reason. |
| **Paused** | user | No | Hidden; Resume → Live (≤30d no re-approval; >30d re-approval). |
| **Sold / Rented** | user | No (hidden) | Closed; **leads retained**; boost expires (no refund, not reusable). |
| **Expired** | system (window ended) | No | Relist/Renew → new plan (payment-first) → re-approval. |
| **Withdrawn** | user | No | Taken down; can relist. |

- **Valid-transition integrity:** only legal transitions are ever offered (e.g. a Draft can't be marked Sold); illegal ones are hidden, and a **stale action re-validates against the current status** before applying (guards two-device and user-vs-admin races).
- System states (Pending, Under Re-review, Expired) are not user-set. Consistent with create-listing §12 + leads §4.2, with the **edit behaviour finalized per §11**.

---

## 5. Needs Attention (action-required smart group)
A pinned group at the top surfacing only listings that need the poster to act, each a one-tap route to the fix:
- **Rejected** → Fix & resubmit (with reason). · **Changes requested** → edit.
- **Expiring soon / Expired** → Renew. · **Unread leads** → respond (→ Leads).
- **RERA missing / expired** (projects) → add/update RERA. · **Draft nearly complete** → finish & publish.
- **Verification pending** (account-level, if the user wants the badge) → Edit Profile.
- Empty when nothing needs action ("You're all caught up"). The single biggest guard against missed actions.

---

## 6. Overview Strip (at-a-glance, lean)
- **Counts by status** (Live · Pending · Draft · Expired · Sold) — tap-to-filter.
- **Leads summary** — total + **new/unread** (→ Leads).
- **Active boosts** — count + soonest expiry.
- **Plan / slots** — **slots remaining to post** + **listings expiring soon** + renew nudge.
- **No vanity metrics** — no view counts, no conversion charts; performance = **leads + status + boost + expiry** only.

---

## 7. Tabs, Filter, Search, Sort
- **Status tabs:** All · Live · Pending · Draft · Rejected · Sold/Rented · Expired · Paused/Withdrawn.
- **Filters:** type (subtype) · city/locality · **boosted** · **has-leads/no-leads** · **expiring soon** · **needs-attention** · date. (Mirrors leads §3.1.)
- **Search:** title · reference ID · locality.
- **Sort:** newest · recently updated · **most leads** · **expiring soon** · price · status.
- Tab/filter/sort selection **persists** across sessions.

---

## 8. Listing Card / Row (the heart)
Standard card skeleton (anti-gap, field shortlist) + **management chrome**:
- **cover · title · reference ID · status badge · price · location · type · posted/updated date.**
- **Lead count — total + new/unread separately** → tap → Leads for this listing.
- **Boost chip + days-left**; **reusable-boost** indicator (admin-reject case).
- **Plan/expiry chip** — days-left / "Expiring soon" / "Expired".
- **Compliance flag** (projects) — **RERA verified / not-applicable / missing / expired**.
- **Number-privacy state** (buyer) — Public/Private shown; change is via edit.
- **Verification badge** (broker/builder).
- **"Edit pending review" chip** when a revision is under review while the listing stays Live (§11).
- **Contextual primary action** by status (Draft→Continue · Live→Boost/Edit · Rejected→Fix · Sold→Relist · Expired→Renew).
- **Three-dot** → full actions (§9). **No view count anywhere.**

---

## 9. Per-Listing Actions (three-dot + contextual, status-gated)
- **Continue editing** (Draft) → create-listing.
- **Edit** (Live/Paused/Sold/Expired) → create-listing edit → re-approval as a pending revision (§11).
- **Change status:** Live · Pause · Resume · Sold/Rented · Withdraw — confirm on Sold/Rented + Withdraw.
- **Boost** (Live only) → Boost screen (payment-first).
- **View public listing** → view screen (owner view). · **View leads** → Leads (this listing).
- **Share** → public link (WhatsApp/copy) + **QR code** for offline promotion (client-generated, near-zero-cost); disabled for non-live.
- **Relist / Renew** (Sold/Expired/Withdrawn) → Payment (new plan) → re-approval.
- **Resubmit** (Rejected, after fixing) → Pending. · **Appeal** (admin-removed) → contact-admin path (§16).
- **Delete** → **soft-delete** to Trash (§18), with a recovery window before permanent purge.

---

## 10. Status-Change & Lifecycle Rules (core interactions)
- **Edit → pending revision, listing stays Live** (§11); the boost **keeps running** because the listing never left public.
- **Pause → Resume** — ≤30 days no re-approval; >30 days re-approval (leads §4.2).
- **Sold / Rented** — hidden from public; **existing leads remain visible**; **boost expires, no refund, not reusable** (boost §7).
- **Delete** — soft-delete + recovery window, then removes the listing **and its leads** (§18); hard confirm states this.
- **Relist / Renew** — new plan (payment-first) → re-approval; fresh live window.
- **Expired** — not boostable; renew prompt.
- **Confirmation dialogs** on every destructive / irreversible / paid transition.

---

## 11. Edit Revisions & Re-approval Visibility — L1 (finalized: live stays public)
- Editing a **Live** listing **keeps the current live version serving publicly** while the edited copy is queued as a **pending revision** for admin review. The listing's status shows **Under Re-review** but it **remains public** (§4); the card carries an **"Edit pending review"** chip.
- **On approval** → the revision **replaces** the live content. **On rejection** → the live version is **unchanged** and the poster sees the reason. **No visibility or lead loss during review.**
- **Boost keeps running** throughout — this **refines boost §7**: a boost **pauses only when the listing is genuinely non-public** (Paused / Withdrawn / Sold / Expired), **not** during an edit-revision review.
- **Editing a non-live listing** (Draft / Rejected / Expired) has no live version to protect → normal flow (stays non-public until approved).
- **First-time submissions** (never-approved) still stay **non-public (Pending)** until approved — there is no prior live version to keep serving.

---

## 12. Slot Lifecycle & Economics — L2 (finalized)
- **Consumed at publish** (payment-first); a **Draft holds no slot** until published.
- **Not returned** on user **Delete / Sold / Rented / Expired / Withdrawn** (payment-first, no refund).
- **Admin Rejection / removal → the slot is preserved and reusable** (the publish wasn't a completed sale of visibility; mirrors boost's admin-reject reuse). The user re-applies the freed slot to a new/edited listing.
- **Relist / Renew = a new slot/plan purchase.**
- The overview shows **purchased · used · remaining · expiring** slots; destructive actions state their slot consequence up front so users aren't surprised.

---

## 13. Plan / Slot & Boost Integration (display + route-out)
- **Per listing:** live-window days-left/expired; **boost status** (active · days-left · leads-during-boost) + Boosted tag; **reusable boost** surfaces to re-apply.
- **Account-level:** slots remaining; buy plan / relist / renew → **Payment** (payment-first; each publish consumes a slot).
- **Boost management is on the Boost screen** — here: status + link-in only.

---

## 14. Leads at-a-glance (link-out, not the pipeline)
- Card shows **lead count (total + new/unread)**; overview aggregates it.
- **Tap → Leads screen** for that listing (pipeline, detail, statuses, call/WhatsApp, notes live there — leads §4).
- **Never duplicates the pipeline** — count + doorway only; unread badges stay consistent with the Leads tab/listing/lead badges.

---

## 15. Project Management Specifics (Developer/Builder) — incl. L3
- Project card shows **stage** (Upcoming / Pre-Launch / New Launch / Under Construction / Ready) · **config summary** · **RERA per-phase status** · **compliance flag**.
- **Deep config / tower-wing-unit inventory editing** is in **create-listing (edit)**; this screen links to it and surfaces the summary.
- **L3 — inventory-availability updates (finalized):** **availability-only** changes (mark a unit/wing **Available / Booked / Sold**) are a **light in-place update that does NOT trigger full re-approval**; **content edits** (price, description, images, specs, RERA) **do** re-approve (as a pending revision per §11). Builders update availability constantly, so availability toggles stay instant and frictionless.
- Quick **availability toggles** may be exposed on the card/summary; **RERA missing/expired** raises a **Needs-Attention** flag + card badge; multiple RERA numbers (one per phase) supported.

---

## 16. Rejection, Moderation & Appeal
- **Rejection** shows the **reason + the specific flagged fields/guidance**; **Fix & resubmit** reopens create-listing at the issue; resubmission → Pending.
- **Admin removal** of a live listing → reason + **Appeal / contact-admin** path; **boost-reuse note** if a boost was active (boost §8); the **slot is preserved** per §12.
- **Repeated rejections** are tracked; a pattern escalates to **account-level moderation** (admin side).
- All rejection/removal events also appear in the listing's **activity history** (§17) and as notifications.

---

## 17. Activity / History Log (per listing)
- A read-only **timeline** per listing: created · submitted · approved · **edited (revision submitted / approved / rejected, with reason)** · price changed · paused/resumed · **boost start/end** · sold/rented · restored-from-trash · lead milestones.
- Sourced from the existing **event bus** (near-zero-cost — the same events that drive notifications), giving the poster and support a single truthful record of "what happened to this listing".

---

## 18. Trash / Soft-delete & Recovery
- **Delete is a soft-delete** → the listing (and its leads) move to **Trash** and are **recoverable for a defined window** (e.g. a few days), then **permanently purged**.
- Copy is explicit: **within the window → Restore**; **after → gone with its leads**. Prevents accidental irreversible loss (since delete destroys lead history).
- Trash is owner-only; restored listings return in their prior non-public status (never auto-republished).

---

## 19. Bulk Actions (management at scale)
- **Multi-select** for **non-paid state changes**: Pause / Resume · Withdraw · **Delete-to-Trash** · Archive (if built).
- **Paid actions stay per-listing** (Boost, Relist/Renew each carry their own payment) — never bulk-charged.
- Useful for brokers/builders with **many** listings; one-pass drafts/expired cleanup.

---

## 20. Drafts, Completeness & Expiry
- **Drafts** — autosaved from create-listing; **Continue / Delete**; **no slot** until publish; retention window; a **completeness indicator** ("2 required fields left") nudges finishing.
- **Rejected** — reason inline; Fix & resubmit (§16).
- **Expiring / Expired** — expiring-soon emphasis + **Renew** CTA; expired grouped in its tab; renewal is payment-first + re-approval; ties to `listing.expiring_soon/expired` notifications; **auto-expire** hides the listing at window end (leads retained).

---

## 21. Real-time, Sync & States
- **Statuses update live** — admin approve/reject flips the card in near-real-time; new leads bump counts; an **approved revision swaps the live content in place** (§11).
- **Multi-device / app↔browser sync**, last-write-wins; stale actions re-validate (§4).
- **States:** loading · loaded · empty · filtered-empty · **offline** (PWA cached last view) · error (retry, distinct from empty).

---

## 22. Empty & First-time States
- **Never posted →** role-appropriate **"Post your first property / project"** + post CTA (→ plan wall → create).
- **Per-tab empty** (no Drafts / no Sold, etc.) → a scoped message, not a blank screen.
- **Needs-Attention empty** → "All caught up".

---

## 23. Responsive (3 distinct management views)
- **Mobile** — single-column **cards**; status chips scroll-row; actions in a sheet; Needs-Attention as a top banner.
- **Tablet** — 2-column cards + filter drawer.
- **Desktop** — a **dense, sortable management TABLE** (columns: listing · status · leads(new/total) · boost · expiry · RERA/compliance · updated · actions) for power users at scale, with row + bulk actions.

---

## 24. Accessibility & Localization
- **Status/compliance badges** use **icon + text** (colour never the sole signal); **status changes are announced** to screen readers.
- **Keyboard-operable** three-dot menus, tabs, tables, and confirm dialogs; visible focus; adequate tap targets; focus returns sanely after a sheet/dialog closes.
- **Localized dates (IST)** and **EN / GU / HI** copy; Indian numbering (Lakh/Cr).

---

## 25. Performance & Scale
- **Server-side** filter/search/sort; **pagination / infinite scroll** (a broker/builder may hold hundreds).
- Efficient **counts** (leads, statuses, slots) without heavy per-card queries; **fixed card skeletons** avoid layout shift; **branded placeholder** for missing images.

---

## 26. Security & Privacy
- **Owner-only, auth-scoped** — no access to others' listings/leads/trash.
- Leads shown here are **counts only**; the inquirer's shared contact lives in Leads detail (privacy rules there).
- Money actions (boost, relist/renew) route through the secured Payment flow; **appeals/removal reasons** are shown only to the owner.

---

## 27. Rules & Edge Cases
- **Only Live is boostable**; Expired/Paused/Sold cannot boost.
- **Publish/relist requires an available slot/plan** (payment-first) — no free publish.
- **Sold retains leads; Delete (after the Trash window) destroys them** — confirm copy makes the difference explicit.
- **Editing a live listing** keeps it public with a pending revision (§11); **availability-only inventory updates** skip re-approval (§15).
- **Withdrawn ≠ Paused ≠ Sold** — distinct intents/visibility.
- **Concurrent edits** (two devices, or user-vs-admin) → last-write-wins + re-validate; a listing whose revision the admin is reviewing while the user acts is reconciled against current status.
- **Valid transitions only** (§4). **Language** EN/GU/HI; **no map**; price in Lakh/Cr.

---

## 28. Optional / Phase-2 (droppable — like collections/compare were)
- **Duplicate / clone** (new Draft from a listing; slot only on publish; then approval).
- **Archive** (declutter Sold/Expired while **retaining leads** — distinct from Delete).
- **CSV export** of one's listings (client-side, near-zero-cost) · **saved filter views** · **pin-to-top** · **listing quality/completeness hints on live listings**.

---

## 29. Excluded from this Screen
- Lead **pipeline & detail** (Leads) — here counts + link.
- Boost **purchase/management** (Boost) — here status only.
- **Create/edit form** + **project inventory editing** (create-listing).
- **Public detail** (view) + **payment/plans** (Payment).
- **Inquiries Sent** (seeker side — Leads).
- **View counts, conversion analytics, map** — not in the product.

---

## 30. Cross-screen Consistency
- **Statuses & lifecycle** → create-listing §12 + leads §4.2, with **edit finalized to keep the listing live via a pending revision (§11)**.
- **Boost** → boost §7–8 (sold expires no-refund, admin-reject reusable) **refined:** boost pauses only when the listing is genuinely non-public — **not** during an edit-revision (§11).
- **Leads** → leads §4 (counts here, pipeline there; shared unread badges).
- **Payment** → payment spec (payment-first publish/relist/renew/boost; **slot preserved on admin rejection**, §12).
- **Notifications** → approved/rejected/changes/expiring/expired/lead-received deep-link here or to the listing.
- **Card** → home card shortlist + anti-gap; **verification badge** (edit-profile §3); **view screen** owner mode.

---

## 31. Referenced Screens (defined elsewhere)
- **Leads / Inquiry** · **Boost** · **create-listing (edit + inventory)** · **listing view / detail** (owner view) · **Payment / plans** · **Notifications** · **Edit Profile** (verification badge) · **home** (card, post entry) · **admin** (approval / rejection / removal / appeal handling that drives statuses).

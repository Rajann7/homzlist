# Admin Panel (account.homzlist.com) — Specification  *(PRODUCTION-READY FINAL; Google-only admin login; Super Admin · Admin · Staff roles)*

> The single **operations back-office** for Homzlist, on the **isolated admin subdomain `account.homzlist.com`**. Everything the platform *cannot* self-serve happens here: **listing/project approval**, **verification review**, **content moderation**, **support**, **plans / promos / admin-granted benefits**, **payments · billing · reconciliation · disputes**, **master-data / taxonomy**, **CMS (Help · articles · legal · marketing)**, **system / error / maintenance pages**, **announcements**, **SEO**, **boost & anti-abuse config**, and a **complete audit log**. Admin is where the *other side* of every user screen lives — every "→ admin" hand-off written across create-listing, my-listings, my-project+inventory, leads, verification, public/edit profile, payment, boost, report-help, saved, search, home, and notifications **terminates here**.
>
> **Final production-hardening pass (this version) adds:** first-Super-Admin **bootstrap** + **integration/credential** management (§2.2); **concurrency, claim-locks & idempotent admin actions** (§5.1); **India compliance** — DPDP consent records, **IT-Rules Grievance Officer**, data localization, **backups / DR**, retention (§30.1); **launch prerequisites / seed data** (§17.1); **IST** timestamps + gateway-down graceful handling (§16.7/§31). Everything else below is retained.
>
> **Access model (locked):** **admin sign-in is GOOGLE-ONLY** — no email/password, no phone number, **no OTP**; an admin authenticates **solely via Google** against an **allow-listed** Google account (§2). **Three admin roles — Super Admin · Admin · Staff (§34)** — with a capability matrix across every module; "role/queue-scoped" notes throughout resolve to that matrix.
>
> **Product invariants honoured everywhere below:** payment-first · **no cash refund on completed purchases** (auto-reversal of a failed debit is a bank event, not a refund) · **verification is an OPTIONAL trust badge, never a gate** to buy/list · **no maps** · **no public view/save counters** (admin gets ops metrics from real data — leads/orders/queues — never resurrects public view counts) · **brokerage removed product-wide** · **near-zero-cost** (manual RERA cross-check, seeded data, single payment gateway, no paid third-party APIs) · INR (Lakh/Cr) + GST · EN admin UI (public UI EN/GU/HI).
>
> **Two console-wide powers (prior pass, retained):** **(P1) everything is editable & configurable at runtime — plans, prices, every limit/window, the public app's OTP & login rules, taxonomy, copy, and the entities themselves (profiles, listings, projects) — nothing hard-coded;** **(P2) everything is clickable — any id/name/amount/status drills into that entity's full A-Z detail and its edit controls.** Both are defined in §2.1 and enforced across every module, **bounded by the role matrix (§34)**.

---

## 0. What this pass covers (module map)
The admin is **one console, many modules**. Every module below traces to a source screen so **nothing ships dead** (the owner's dead-page worry, applied admin-side):

| # | Module | Feeds off / terminates the hand-off from |
|---|---|---|
| 4 | Dashboard / Overview | all queues |
| 5 | Work Queue + Admin Notification Inbox | notifications §14 (`admin.*`) |
| 6 | Listing Moderation & Approval | create-listing §7, my-listings §4/§11/§12 |
| 7 | Project & Inventory Oversight | my-project+inventory, create-listing §6 |
| 8 | Verification Review | verification, edit-profile §3 |
| 9 | Reports & Moderation | report-help §4–6, leads §4.3, listing-view §11, public-profile §9 |
| 10 | Reviews Moderation | public-profile §8 |
| 11 | Support / Tickets | report-help §7–8, payment §14 |
| 12 | User / Account Management | edit-profile §5.4/§7, public-profile §10 |
| 13 | Plans & Boost Plans | payment §3, boost §3 |
| 14 | Promo Codes | payment §4 |
| 15 | Admin-Granted Benefits | payment §4 |
| 16 | Payments · Billing · Reconciliation · Disputes | payment §12–18 |
| 17 | Master Data & Taxonomy | create-listing §3/§5/§6, search §3, home §4 |
| 18 | CMS (Help · Articles · Marketing) | report-help §7.1, home §6/§10, search §10 |
| 19 | Legal / Policy Pages | **new screen** (Terms · Privacy · Refund · About · Contact) |
| 20 | System / Error / Maintenance Pages | **new screen** (404 · 500 · offline · maintenance) |
| 21 | Announcements / Broadcast | notifications §7.6 (`admin.announcement`) |
| 22 | Notification Catalog · Templates · Channel Governance | notifications §4/§5/§18 |
| 23 | SEO Management | search §10, public-profile §12 |
| 24 | Boost Placement & Ranking Config | boost §12, search §4, home §11 |
| 25 | Anti-Abuse · Rate-Limit · Fraud Config | listing-view §10.3, report-help §5, payment §18 |
| 26 | Platform Settings & Feature Flags | product-wide |
| 27 | Audit Log | every admin action |
| 28 | Analytics & Ops Reporting | real data (no public view counts) |

---

## 1. Purpose & Scope
- One back-office that **operates, moderates, monetises, and governs** the whole platform.
- **In scope (A-to-Z):** the module map above + admin notifications, security/privacy, audit, states, near-zero-cost operating rules, and the admin **information architecture** that guarantees every hand-off is reachable and every outcome is clickable back to the user.
- **Out of scope (elsewhere):** the **user-facing** halves of every flow (defined on their own screens — admin only produces the outcome + deep-link); low-level infra (mail/WhatsApp transport, gateway internals) beyond what admin **configures/monitors**. *(Admin roles/RBAC are now IN scope — §34.)*
- **Access:** isolated subdomain, separate auth scope, **admin actions fully audited (§27)**.

---

## 2. Platform, Access & Isolation
- **Isolated subdomain** `account.homzlist.com`, physically/logically separated from the public app; **separate session/auth**; **no shared login** with user accounts.
- **Admin sign-in = GOOGLE ONLY (locked).** An admin authenticates **exclusively through Google (OAuth 2.0 / "Sign in with Google")**. **No email/password form, no phone number, no OTP** on the admin side — the OTP/phone flows are the **public app's** mechanism (users), never the admin's. There is **no admin self-registration**: an admin exists only if a **Super Admin has added their Google account to the allow-list** and assigned a role (§34).
  - **Allow-list + role binding:** each permitted **Google account (email identity)** is mapped to exactly one role (Super Admin / Admin / Staff) and, for Staff, to assigned queues. A Google login that isn't allow-listed is refused (no access, logged).
  - **Domain/workspace option:** the allow-list may be an explicit account list and/or a permitted Google Workspace domain (Super-Admin-configurable, §34/§26.4).
  - **Security posture:** rely on **Google's own 2FA/MFA**; enforce **session timeout**, **device/session visibility**, and **step-up re-consent (re-auth via Google)** before **destructive / financial** actions (ban, account delete, remove listing, grant/revoke benefit, invoice credit-note, plan-price change, config rollback, role change).
  - **Revocation is instant:** removing a Google account from the allow-list (or disabling it in Google) **kills admin access immediately**; active sessions are invalidated.
- **Every admin write is audited (§27)** — actor (the Google identity) · action · target · before/after · timestamp · reason (immutable log).
- **RBAC = DEFINED (§34):** three roles — **Super Admin · Admin · Staff** — with a capability matrix across every module; Staff are additionally **queue-scoped**. Every "role/queue-scoped" note below resolves to §34.
- **Admin UI language = EN** (public app stays EN/GU/HI). Admin is a **PWA-capable console** but push/offline are ops conveniences, not user promises.

### 2.1 Two governing principles (apply to EVERY module below, bounded by the role matrix §34)
- **P1 — Everything is EDITABLE & CONFIGURABLE; nothing is hard-coded.** Every plan, price, limit, window, threshold, the **public app's** OTP/auth rules, taxonomy value, badge, copy string, template, page, and feature toggle is **admin-editable at runtime without a deploy** (§26 is the central registry; individual modules edit their own domain). Admin can also **directly edit or remove the underlying entity itself** — a user profile, a listing/project's every field, a review, a lead flag, an order's invoice detail. Every such edit/removal is **audited (§27)**, **owner-notified** where it affects a user, **never consumes the user's slot/quota**, and **gated by the acting admin's role (§34)**. Values the owner named as examples (all editable, shown here as *defaults*): **public-login OTP resend limit = 3**, **OTP request rate-limit = 3 / window**, **user login/session validity = 1 month**, **pause→resume-without-re-approval window = 30 days (+ on/off)** — see §26.1/§26.2. *(These are the **public app's** knobs; the admin's own login is Google-only and has no OTP.)*
- **P2 — Everything is CLICKABLE → drill-down A-Z.** Anywhere an entity id/name/number/badge/amount/status appears in the console, it is a **link to that entity's full A-Z detail** (user → 360; PROP-/PROJ- → listing/project admin; Order ID → order+invoice; ticket/report/verification id → its detail; a locality/city/plan/promo/template → its editor). **No dead text, no read-only dead-ends** — from any surface an admin reaches the complete record and its edit controls in one or two clicks (subject to §34).

### 2.2 Bootstrap, integrations & credentials  *(production prerequisites)*
- **First-Super-Admin bootstrap** — the allow-list needs a Super Admin, but the first one can't be added from inside an empty console. Resolve the chicken-and-egg by **seeding the first Super Admin's Google account at deploy** (env/config / one-time secured setup). Once in, that Super Admin adds the rest (§34); the seed path is then closed/logged.
- **Integration & credential management (Super Admin only, §34):** a secured settings area holds — **Google OAuth client (admin SSO)** · **payment-gateway keys + webhook signing secret** · **email sender** (domain/keys) · **WhatsApp company-number/provider credentials** · **RERA state-portal links** (manual, no key). Secrets are **write-only / masked**, **rotatable**, **never exposed to the client**, **never in the audit "before→after" in cleartext**, and each rotation is audited.
- **Gateway is the sole paid dependency** — its keys live here; **no other paid third-party keys exist** (near-zero-cost, §32).
- **Least-exposure** — Admin/Staff never see credentials; only Super Admin, and only masked.

---

## 3. Admin Information Architecture (nothing-dead guarantee, admin-side)
- **Left side-nav → modules (§0);** each module opens a **list/queue → detail** pattern.
- **Every user-screen "→ admin" reference has a concrete destination here** (the table in §0 is the closure proof). A build/QA check maps each source hand-off (`admin.report.filed`, `admin.verification.requested`, relist re-approval, boost-reuse, etc.) to a live admin destination; **an unmapped hand-off fails the check** (mirrors the notification catalog governance in §22).
- **Every admin outcome that touches a user emits a clickable user notification** with a deep-link (§21, §29) — so no admin action is a silent dead-end for the user either.
- **Global search** (top bar): by user (name/number/email/GSTIN), listing/project (PROP-/PROJ-XXXXX), Order ID, ticket ID, report ID, verification ID — jump straight to any entity's admin 360 view.

---

## 4. Dashboard / Overview
- **Live queue counters (tap → the queue):** Listings pending · Edit-revisions to review · Verifications pending · Reports open · Tickets open · Payment issues open · Chargebacks · Ops alerts (webhook/reconciliation/RERA anomalies).
- **SLA health:** oldest item age per queue + breach flags (drives §5 prioritisation).
- **Ops/business snapshot (real data only):** new signups · listings live/pending/rejected · projects live · new leads generated · orders (success/failed/pending) · revenue (period) · benefits outstanding · verifications by level. **No view counts anywhere.**
- **Platform health:** maintenance-mode state (§20), feature-flag summary (§26), gateway/webhook status, mail/WhatsApp deliverability (best-effort drop counts from notifications §5.3).
- **Empty/first-run:** friendly "all clear" per queue, never blank.

---

## 5. Work Queue + Admin Notification Inbox (the operational spine)
> Same event engine as users (notifications §14), **admin-side feed**, isolated on the subdomain. This is how staff *find work*.

- **Admin event set (from notifications §14):** `admin.listing.pending` · `admin.listing.re_review` · `admin.verification.requested` · `admin.report.filed` · `admin.payment.issue_raised` · `admin.payment.chargeback` · `admin.ops.*` (queue backlog, failed-webhook reconciliation, RERA anomaly) · `admin.staff.assigned` / `admin.staff.escalated`.
- **Channels for staff:** in-app admin console + browser push; **limited email digests** for high-priority ops; **no WhatsApp** for staff.
- **Per item:** **claim / assign**, **priority / SLA**, **notes**, **escalate**, and **mark-handled = performing the actual action** (not a dismiss) — closing the notification requires the real decision.
- **Clickable → the exact queue item** (approval, verification, report, dispute…). Deep-links are schema-required (notifications §9), so no dead admin notification.
- **Filters:** queue/category · priority · SLA-breaching · assigned-to-me/unassigned · date.
- **Idempotent fan-out with retries;** the in-app admin record is source of truth.

### 5.1 Concurrency, locks & idempotent actions  *(production)*
- **Claim-lock** — when a staffer claims/opens a queue item, it is **soft-locked to them** (visible "being handled by X"); a second admin sees the lock and can **force-take** (audited) rather than silently colliding.
- **Stale-action re-validation** — before an action commits, the server **re-checks the item's current state** (e.g. the listing was already approved/removed, the order already reconciled by the job). A stale action is **rejected with the fresh state**, never double-applied (mirrors my-listings valid-transition integrity).
- **Idempotent admin writes** — every decisive action (approve, reject, remove, grant, resolve, complete-fulfilment) is **idempotent / double-submit-guarded** — clicking twice or two admins acting at once yields **one** effect, one audit entry.
- **Optimistic UI with server truth** — triage may update optimistically, but the **server outcome wins**; conflicts surface as a clear "already handled" rather than a duplicate.

---

## 6. Listing Moderation & Approval  *(the highest-volume module)*
> Terminates create-listing §7 (lifecycle) and my-listings §4/§11/§12 (L1 edit-keeps-live, L2 slot lifecycle). Applies to **Property** listings; **Project** review adds §7.

### 6.1 Two review types (must not be conflated)
1. **First-time submission** — status **Pending Approval**, **not public**. Decision: **Approve → Live** · **Reject (reason) → Rejected** · **Request changes (what to fix) → Changes-requested**.
2. **Edit revision on a Live listing** — status **Under Re-review**, **live version stays public** (L1). Decision: **Approve → the revision replaces the live content** · **Reject (reason) → live content untouched, poster sees reason**. The poster's card shows "Edit pending review"; **boost keeps running** during an edit-revision (boost pauses only when genuinely non-public — my-listings §11 refinement of boost §7).

### 6.2 Review workspace
- **Full rendered preview** exactly as the view screen will show it (all auto-rendered type fields, gallery, watermarked images, poster/contact block).
- **Field-level checklist** — required-field completeness, price/area sanity, image min/max + watermark applied, description length, contact/number-privacy state.
- **Diff view for revisions** — highlights exactly what changed (fields, price, images, RERA) old→new so review is fast and fair.
- **Reason codes + flagged fields** — a structured reason catalog (spam · fraud/scam · wrong/misleading · duplicate · offensive · wrong location/price · missing/invalid RERA · poor images · prohibited content) **plus free text**; flagged fields route the poster straight to the fix (my-listings §5 Needs-Attention, §9).
- **RERA cross-check (manual, near-zero-cost)** — open the state portal (Gujarat → **GujRERA**) to validate the number; set **RERA Verified / not-applicable / invalid**; the tag only stands when validation passes (create-listing §6.4, §4). RERA anomalies raise `admin.ops.rera_anomaly` (§5).
- **Duplicate detection aid** — surface likely duplicates (same address/ref/images) to support the duplicate reason.

### 6.3 Decisions & downstream consequences (locked)
- **Approve (first-time)** → **Live**; `listing.approved` (+email) to poster; enters public feeds/search.
- **Approve (revision)** → revision content goes live; `listing.under_re_review`→resolved; boost unaffected.
- **Reject / Request changes** → `listing.rejected` / `listing.changes_requested` (+email) with reason + flagged fields; poster edits & resubmits within the paid window.
- **Admin removal of a Live listing** (post-approval, e.g. later violation) → listing pulled from public; `admin.listing_removed` (+email, reason; **+ boost-reuse note**). **Consequences (L2 + boost §8):** **NO refund**, but the **listing slot is preserved/reusable** and any **active boost becomes reusable (remaining days)** on another own live listing. Saved copies flip to "no longer available" (saved §7).
- **Appeal / contact-admin path** — an admin-removed/rejected poster can appeal via Support (§11); the appeal links back to this listing's moderation record.

### 6.4 All-listings management (beyond the queue)
- **Search/filter every listing** (any status, any role) by ref/city/type/status/boosted/flagged/RERA-state/date.
- **Force actions (audited):** re-open review · force-remove · restore · edit-lock · mark spam. Never silently edits a user's content; changes are logged and notified.
- **Bulk moderation** — approve / reject / remove / mark-spam **multiple** listings at once (e.g. clearing a spam wave), each still **audited with a reason** and each firing its own user notification; **no silent bulk edits of user content**.
- **Availability-only project updates skip full re-approval** (L3) — admin does **not** re-review inventory availability toggles; only **content revisions** enter this queue (§7).

### 6.5 Admin DIRECT edit of any listing / project (A-Z) — per P1
> A mature-SaaS power the owner asked for: admin can make **any change, small or big, to any property/project himself** — not only approve/reject the owner's edits.
- **Full-field editor** — admin opens **any** listing/project (any status) in the **same A-Z field set as create-listing** (basics · location · contact/number-privacy · media/watermark · amenities · pricing · type-specific fields · project configs/inventory/RERA/docs). **Every field editable**, incl. correcting a typo, price, image, locality, or RERA number.
- **Admin edits are trusted:** by default an admin edit **publishes directly without routing to the approval queue** (admin *is* the reviewer) — but a per-edit **"send back for owner confirmation / re-review"** option exists for sensitive changes. Configurable in §26.
- **Never consumes the owner's slot/quota; never charges; boost/plan/expiry untouched** unless the admin explicitly changes them.
- **Owner is notified** of an admin content change (`admin.listing_edited`, +email if material) with a **diff**, and the change lands in the listing's **activity history**; **fully audited** (before→after, reason).
- **Remove / restore** — admin can remove any listing (soft-delete with a recovery window → then purge) and restore within the window (mirrors my-listings trash); removal follows the §6.3 no-refund + slot/boost-reuse rules.
- **Force status** — set/override any *legal* status (Live/Paused/Withdrawn/Sold/Expired) with reason; illegal transitions blocked (valid-transition integrity, my-listings §4).

---

## 7. Project & Inventory Oversight  *(builder/developer projects)*
> Adds to §6 for **Projects** (PROJ-XXXXX). Source: my-project+inventory + create-listing §6.
- **Project review** = §6 flow + project extras: **configurations table**, **status-based fields** (Upcoming…Ready-to-Move), **phase-wise RERA** (one per phase), **brochure/price-list PDFs**, **wing/tower inventory presence**, **approvals & clearances**.
- **RERA per phase** — validate each phase's number on GujRERA; each phase can carry its own **Verified / not-applicable / invalid** state. Missing/expired RERA on a project → compliance flag + Needs-Attention on the poster side.
- **Two edit lanes enforced (L3):** **availability-only** unit changes (Available/Booked/Sold) are **instant, not reviewed**; **content revisions** (structure add/remove, unit price/area/config, stage, media, RERA, docs) come here as **pending revisions** with a diff, live project keeps serving.
- **Public inventory exposure** — admin can see the builder's chosen exposure mode (full grid / config-summary / hidden) for context; admin does not override it except via a content-moderation action (logged).
- **Bulk-import provenance** — inventory CSV/generator imports appear in the project's activity history; admin reviews only the **structure revision**, never per-unit availability churn.
- **Leads are project-level** (no per-unit) — admin sees counts, not buyer PII beyond moderation scope (§9, §30).

---

## 8. Verification Review  *(tiered trust badge — never a gate)*
> Terminates verification + edit-profile §3. Broker & Developer/Builder only; **Buyers excluded**. **Optional** — approving/denying **never** blocks buying or listing (payment §20).

- **Queue:** `admin.verification.requested`; per applicant: role · pre-filled business details · **per-document set** · RERA number (if any) · declaration.
- **Per-document decision:** each doc **Verified / Rejected (reason)** individually; **name-match check** across ID/PAN/profile flagged.
- **Computed level (not manual badge):** identity/business KYC passing → **Level 1** (Broker "ID Verified" / Builder "Business Verified"); **+ valid RERA** → **Level 2** ("RERA Verified Agent/Builder"). **Partial pass → the real lower level** it supports (never "nothing" once identity passes, never over-claimed).
- **RERA validation** — manual cross-check on the **state portal** (near-zero-cost, no paid API); auto-populated promoter/validity where the portal shows it.
- **Agency add-on** — business registration / GST → "Registered Agency" signal alongside the level.
- **Lifecycle:** Pending → Verified(level) / Partially-verified / Rejected(no level) · **Revoke** (reason → badge removed everywhere immediately) · **Expiry** (e.g. RERA 5-yr → drop that tier, may fall back to Level 1, renew prompt) · **re-upload** a single rejected doc (cooldown/cap) · **withdraw while pending** · **re-review** on a verified account's critical-field edit (edit-profile §7).
- **Badge propagation is automatic** (verification §6) to public profile · listing cards · view-screen poster block · leads inquirer profile — admin only sets the underlying state; **the tooltip states exactly what was verified**.
- **Documents are strictly private** — admin-only, encrypted, auth-scoped, retained per policy; **only the level/badge is public** (§30).
- **Notifications:** `verification.verified/rejected` (+email), `verification.revoked` (+email), doc-level events, `verification.expiring/expired`.

---

## 9. Reports & Moderation  *(content flags across all entities)*
> Terminates every contextual **Report** action: listing (view §11), profile & review (public-profile §9), lead/inquirer (leads §4.3). Report **form/tracking** lives on report-help; **decisions live here**.

- **Report queue** per entity type with its reason set:
  - **Listing:** spam · fraud/scam · already sold/rented · wrong/misleading · duplicate · offensive · wrong location/price.
  - **Profile:** fake/impersonation · spam · fraud · offensive · wrong info.
  - **Lead/inquirer:** fake · spam · abusive/harassment · wrong number.
  - **Review:** fake · spam · offensive · irrelevant.
- **Aggregation & priority** — many reports on one entity **roll up** into a flag count + priority; **a configurable high threshold auto-hides** the entity **pending review** (§26 threshold config). The reporter only ever sees **their own** report (report-help §5).
- **Dedupe** — one report per user per entity (re-report updates, never duplicates).
- **False-report tracking** — repeat malicious reporters flagged and rate-limited (anti report-bombing).
- **Reporter anonymity** — the reported party **never** learns who reported (§30).
- **Decision → outcome:** **Actioned** (remove/hide listing · suspend/ban profile · remove review · flag lead) **/ Dismissed** (no violation). Sets the report to **Actioned/Dismissed → Closed**; user sees only a **generic** result ("action taken" / "no violation") — never internal detail.
- **Cross-links:** an actioned listing report → §6 removal path (slot/boost reuse rules); an actioned profile report → §12 account state; an actioned review → §10.
- **Gone target** — the report **persists** with a "no longer available" reference (retain-not-drop).

---

## 10. Reviews Moderation  *(Broker & Builder ratings/reviews trust layer)*
> Source: public-profile §8. Buyers have no ratings.
- **Eligibility gate** — reviews come **only from users who actually interacted** (sent an inquiry / became a lead); drive-by reviews are blocked at source.
- **Pre-publish screening** — spam/fake screen before a review shows; admin approves/holds/removes.
- **Per-review report handling** (§9 review reasons).
- **Moderation actions:** approve · hold · remove (reason) · restore; repeat abusive reviewers → §12.
- Rating recomputes automatically when a review is removed.

---

## 11. Support / Tickets  *(one support system; payment issues unified here)*
> Terminates report-help §7–8 and payment §14. Async tickets + self-service FAQ (no paid live chat — near-zero-cost).
- **Ticket queue:** category (account · payment · listing · verification · technical · bug/feedback · other) · **urgent/safety flagged higher** (harassment, fraud) · related reference auto-linked (Order ID / listing / verification).
- **Threaded conversation** — staff ↔ user inline replies; **status Open → In progress → Resolved → Closed**; **reopen window**; optional **CSAT** rating.
- **Payment-issue unification** — payment §14 "report a payment issue" arrives as **category = Payment, linked to Order ID**, resolved with the **explicit non-refund resolutions** (§16.5): complete fulfilment · confirm bank auto-reversal · restore a free benefit · reissue/correct invoice — **never a cash refund of a completed purchase**.
- **Locked-out support path** — **banned/suspended/temp-blocked** users reach a **minimal Contact Support** (their number already known; email/WhatsApp shown); guests get FAQ + a contact form. Admin handles both without unlocking the account.
- **SLA / response-time** shown to the user; breaches surface in §4/§5.
- **Gone target** — ticket persists with a "no longer available" reference.

---

## 12. User / Account Management  *(the complete A-Z 360 + full edit/remove control)*
> Source: edit-profile §5.4/§7, public-profile §10, home role matrix. Per **P1 (edit everything) + P2 (click into everything)**.

### 12.1 User 360 — see EVERYTHING about a user (A-Z), every part clickable
Admin opens one user and sees **their entire footprint**, each item a link to its own admin detail:
- **Identity & profile** — role · all role-based profile fields · avatar/logo · about · cities · member-since · public/hidden field toggles.
- **Numbers & auth** — primary/login number · additional public numbers (OTP-verified state) · WhatsApp-reachability cache · email-on-file · **sessions/devices** · OTP/login attempt history (for support).
- **Verification** — current level + per-document set + history (docs open **access-logged**, §30).
- **Listings/projects** — **all statuses** (Draft…Sold/Withdrawn/Expired) with counts and one-click into each.
- **Leads & inquiries** — leads received on own listings + inquiries sent (privacy-scoped to what was shared, §30).
- **Money** — orders · invoices · benefits granted/consumed · promo usage · payment issues/tickets.
- **Trust & safety** — reports filed by them · reports against them · reviews written/received · account flags · false-report score.
- **Notifications** — what was sent to them + channels + delivery (best-effort drops).
- **Activity timeline** — full event history; **admin-actions-on-this-user** sub-log.
- Everything **auth-scoped & audited**; sensitive sections (verification docs, saved list) are **access-logged on open**. (The product's privacy invariants — reporter anonymity, no public save/view counters, poster can't see who saved — restrict *other users/public*, **not** the audited admin.)

### 12.2 Edit / remove / create EVERYTHING (A-Z)
- **Edit any profile field** — name/business name, about, cities, logo/photo, public-hidden toggles, additional numbers. Editing a **verification-critical** field triggers §8 re-review. All audited + owner-notified.
- **Remove a user's profile / assets** — remove avatar/logo, remove an additional number, **remove/blank any field**, or **delete the whole account** (admin-initiated), with the **same cascade as user-delete** (listings + leads removed), a **recovery window**, and full audit. This is the "admin can also remove a user's profile" power the owner asked for.
- **Manual create / onboard** — admin can create or pre-fill a user/account (e.g. onboard a builder for support/seeding), audited; the user still owns it via phone-first login.
- **Number/contact override (support)** — normally the primary = login number changes only via the Change-Number OTP flow; an **admin override** exists for support cases, **audited + re-authed**, never silent.
- **Force verification (override)** — admin may manually grant/adjust a verification level in an edge case, **audited**, with the "what's verified" label kept honest (§8).

### 12.3 Account states & lifecycle
- **Admin-set, audited, user-notified:** **Active · Temp-blocked · Suspended ("Profile unavailable") · Banned (profile removed/unavailable) · Reinstate.** Each needs a **reason**; `admin.account_suspended/banned` (+email, reason/appeal) fire; locked-out users keep the §11 minimal support path.
- **Read-only "view-as"** — an audited, **read-only** support view of what the user sees; admin **acts on the account from admin tools (§12.2), not as the user** — clearer audit than true impersonation.
- **Merge/duplicate handling** — one number = one account; tools to investigate duplicate/abuse signups.

---

## 13. Plans & Boost Plans  *(monetisation catalog)*
> Source: payment §3, boost §3. **No brokerage anywhere.**
- **Fully editable catalog (P1):** **every field of every plan is editable** — name, price, slots, live-days, features, Recommended tag, ordering, visibility, eligibility. Changes are **versioned + effective-dated + audited**, support **schedule-ahead** (a price change from a future date) and **rollback** to a prior version, and **never alter already-purchased orders** (quote-locked, payment §21). Create · edit · duplicate · retire · re-order.
- **Listing plans (role-wise):** Buyer/Broker = **property** plans; Developer/Builder = **project** plans. Each plan: name · **price (₹)** · **slots granted** · **live-days** · feature list · **Recommended** tag · **savings vs shorter** · optional **bundle/multi-slot**.
- **Boost plans (day-wise):** each = **N days** at a price; **placement identical across plans — only duration differs** (boost §2). Per-day cost + savings shown.
- **Trial plans:** free/time-limited trial per context; **never auto-charges / auto-renews** (payment §4); one per grant. Configure terms, duration, limit, eligibility (role/context/type).
- **Relist/Renew** uses the same role-wise plans (payment §2). Upgrade/downgrade paths where applicable.
- **Empty/unavailable plan** → user sees a clear message, never a blank checkout (payment §3).

---

## 14. Promo Codes
> Source: payment §4 "have a code?".
- **Create/manage codes:** % or flat reduction (or 100% waiver) · **scope** (role / context / listing-type / plan) · **usage limit** (global + per-user) · **validity window** · active/paused.
- **Server-side validation states** the user may hit: invalid · expired · not-applicable-to-this-plan/role/context · usage-limit reached.
- **GST computed on the discounted taxable value** (payment §6). **A 100% code → ₹0 order → gateway skipped → ₹0 complimentary receipt** (payment §4/§9).
- Usage reporting; abuse/velocity guard (§25).

---

## 15. Admin-Granted Benefits  *(the ONLY non-paid access path)*
> Source: payment §4. **No referral / credit / wallet exists** — free/discounted access is **only** here.
- **Grant types:** free listing slot(s) · free boost (N days) · trial plan · admin discount/waiver (%/flat/full) · (promo codes = §14).
- **Grant controls:** recipient (user) · type · **quantity/balance** · **validity/expiry** · **scope** (role/context/listing-type). Reason + audit.
- **Consumption & display** — surfaced/consumed **on the Payment screen** as a "use free" alternative (never auto-spent); balance decrements on use; **unused → lapse (no monetary value, no refund)**.
- **Revoke** — admin may revoke an **unused** benefit (it disappears for the user); an **already-consumed** benefit stands (the listing/boost it created is honoured).
- **Notifications:** `admin.benefit_granted` (+email); consumption/expiry reflected on Payment.
- **Reporting:** outstanding benefits, consumption, expiry — feeds §4 dashboard.

---

## 16. Payments · Billing · Reconciliation · Disputes
> Source: payment §12–18. Admin **displays outcomes and resolves**, per the locked non-refund model.
### 16.1 Orders & invoices
- **All orders:** Order ID · context (slot/boost/relist) · user · base/discount/tax/total (or ₹0) · gateway **UTR/RRN** · status (Success/Free/Failed/Pending/Verifying/Reversed) · issue-status · invoice ref · timestamps.
- **GST invoicing config:** seller GSTIN · **SAC code** · **invoice-number series** · CGST/SGST/IGST vs IGST logic · buyer GSTIN capture. **Reissue/correction → corrected invoice / tax credit note (tax document only, not money movement).**
### 16.2 Reconciliation & webhook health
- **Background job** matches **gateway status ↔ orders**: *paid-but-not-unlocked* → **auto-complete fulfilment**; *debited-but-failed* → **Failed, left for bank auto-reversal**; *duplicate/uncaptured* → **flagged & reversed**. Admin **monitors** the job + **failed-webhook** ops alerts (§5 `admin.ops.*`).
- **Manual ops actions (audited):** **re-run reconciliation** for an order/window · **replay a failed webhook** · **re-poll gateway status** · **manually complete a verified-successful fulfilment** — all resolve to fulfilment/reversal outcomes only, **never a cash refund**, and never a re-charge.
### 16.3 Deducted-but-failed (India case)
- Surfaced as **Verifying**; resolved to unlock (if it truly succeeded) or **left for bank auto-reversal (2–5 business days)** with UTR/RRN — **not a refund** (payment §12).
### 16.4 Chargebacks
- **Bank-initiated** → related order/fulfilment **suspended pending resolution**; outcome bank-decided, reconciled here; `admin.payment.chargeback` (§5).
### 16.5 Issue resolutions (explicit, non-refund only)
- **Complete the fulfilment** · **confirm bank auto-reversal** · **restore a free benefit** · **reissue/correct an invoice** — **never a cash refund of a completed purchase** (payment §14/§16). Ties to §11 payment tickets.
### 16.6 Fraud/integrity
- Idempotency (no double charge), velocity/fraud checks, benefit-abuse checks, mismatched-amount rejection (payment §18; config §25).
### 16.7 Gateway degradation (graceful)
- **Gateway maintenance / outage toggle** (§26.4) → public **checkout shows a friendly "try again shortly", no dead end**; **₹0 / benefit-only flows keep working** (no gateway needed); in-flight orders reconcile when the gateway returns (§16.2). Admin sees gateway status on the dashboard (§4).

---

## 17. Master Data & Taxonomy  *(drives create-listing + filters)*
> Source: create-listing §3/§5/§6, search §3, home §4. **Single source of truth for every enum.**
- **Listing taxonomy:** categories (Residential/Commercial/Plot-Land) · **all property types** (flat, builder-floor, studio, villa/bungalow/rowhouse, penthouse, tenement, farmhouse, PG [rent], office, shop, showroom, godown/warehouse, industrial shed, co-working [rent]; plots: residential/commercial/industrial/agriculture/farm) · **project categories & sub-types** (with inventory tables) · **project statuses** (Upcoming/Pre-Launch/New-Launch/Under-Construction/Ready-to-Move) and their status-driven fields.
- **Attribute vocabularies:** amenities list · furnishing options · facing/direction · ownership types · area units (sq.ft/sq.yd-gaj/sq.m/Bigha/Vigha/Guntha/Acre/Hectare) + **canonical-unit mapping** · tenant types · PG occupancy/gender · connectivity landmark types.
- **Geography (no maps, seeded):** **State → City → Locality/Area** master + **seeded locality typeahead per city** (home §4). Add/merge/rename localities; mark **featured/trending** cities (home §10, CMS §18).
- **RERA rules:** exemption thresholds (< 500 sq.m / < 8 units), state-portal links per state (Gujarat → GujRERA).
- **Pricing display rules:** Lakh/Cr formatting, price-on-request behaviour.
- **Governance:** editing a taxonomy value that listings/filters depend on is **versioned & audited**; removing an in-use value is blocked or requires a migration (data-integrity, mirrors my-project+inventory "config-in-use can't be removed").

### 17.1 Launch prerequisites (seed-before-go-live)
- The platform can't function empty. **Before public launch these must be seeded:** the **taxonomy** (categories/types/amenities/units/statuses), **at least one city + its localities** (seeded typeahead), the **plans** (property + project + boost), **GST/invoice config** (§16.1), **legal pages** (§19), **system/error/maintenance pages** (§20), and the **first Super Admin** (§2.2).
- A **readiness checklist** on the dashboard flags any missing prerequisite so a half-configured platform can't go live with dead selectors or empty checkouts.

---

## 18. CMS — Help · Articles · Marketing
> Source: report-help §7.1, home §6/§10, search §10.
- **Help Center / FAQ:** searchable, **categorised** (posting · payments/plans/boost · verification · leads/inquiries · account · technical); **contextual-help mapping** (which article shows where); publish/unpublish; EN/GU/HI.
- **Articles / Guides (SEO):** create/edit/schedule; slugs, meta, OG; feeds home §6I + SEO §23.
- **Marketing / low-inventory band content** (home §10): value headlines, trust stats (**honest/seeded, never fake**), how-it-works, why-Homzlist, **featured cities**, testimonials (as they accrue). Admin curates so a thin city still **sells the platform** (never "notify me").
- **Placeholders & branding** — branded image placeholders, empty-state copy.

---

## 19. Legal / Policy Pages  *(new screen — Terms · Privacy · Refund · About · Contact)*
- **Managed pages:** **Terms**, **Privacy**, **Refund policy** (states the **no-refund-on-completed-purchase + failed-debit auto-reversal** model — payment §13), **About**, **Contact**.
- **Editor + versioning** — every publish is a **new version with effective-date**; **prior versions retained** (audit/legal).
- **Acceptance tracking** — Terms/Privacy are accepted at registration and shown "Accepted" in Edit Profile §5.5; admin sees **which version a user accepted** and can require **re-acceptance** on a material change.
- **Localisation** EN/GU/HI; **linked in the footer** (home §6L) so pages are never dead.
- **Contact page** wires into Support (§11) channels: in-app ticket · email · WhatsApp.

---

## 20. System / Error / Maintenance Pages  *(new screen)*
- **Managed pages:** **404** (not-found) · **500** (server error) · **offline** (PWA) · **maintenance**.
- **Content control** — branded copy/illustration, a safe **"go home / search / contact support"** affordance so an error is never a dead end (mirrors the graceful-fallback rule product-wide).
- **Maintenance mode toggle** — schedule/enable a maintenance window; public app shows the maintenance page while **admin + gateway webhooks/reconciliation** keep running; banner/countdown copy configurable.
- **PWA offline page** — the app shell + "offline — last updated …" copy; consistent with home/search/saved/notifications offline behaviour.
- **Deep-link safety** — a notification/deep-link to a **gone target** resolves to a **tombstone**, not a raw 404 (notifications §9); the 404 page is the last-resort fallback.

---

## 21. Announcements / Broadcast
> Source: notifications §7.6 `admin.announcement`.
- **Compose** a platform announcement → targeted (all / role / city / segment) · **in-app + browser** by default; **email only if flagged important** (respects the limited-email policy, notifications §5).
- **Clickable target required** (a page, listing, or announcement detail) — no dead announcement.
- Schedule, preview, throttle/de-dupe (notifications §12); audited.

---

## 22. Notification Catalog · Templates · Channel Governance
> Source: notifications §4/§5/§18 (the "email/WhatsApp template & campaign tooling" it defers to admin).
- **Catalog/registry view** — every `event_key` with recipient resolver · template · category · priority · **channel class** · deep-link builder. **Read-mostly** (features register events in code); admin **audits completeness**.
- **Build-check surface** — flags any event missing a **recipient or deep-link** (governance §4/§18) so nothing ships dead/un-clickable.
- **Templates** — edit **email** and **WhatsApp** copy (EN/GU/HI), variables, and the company WhatsApp sender identity; **channel policy is fixed** (in-app+browser = all · WhatsApp = leads only · email = main set only) and **not overridable per-event by copy edits**.
- **Deliverability monitoring** — bounce/undeliverable drop counts (best-effort, §5.3), **WhatsApp not-reachable cache** visibility (no paid pre-check API).

---

## 23. SEO Management
> Source: search §10, public-profile §12.
- **Canonical URL patterns** for filter/location combos (`/property-for-sale-in-<city>-<locality>`, `/<n>-bhk-flats-in-<locality>`); pagination canonicalisation.
- **Per-combo meta title/description + OG** templates; **listing & profile OG** (cover/avatar) previews.
- **Sitemaps / robots**, redirects for renamed localities/slugs; **shareable result & profile URLs**.
- Near-zero-cost: internal, no paid SEO API.

---

## 24. Boost Placement & Ranking Config
> Source: boost §12, search §4, home §11. **Boost auto-activates with no admin approval** (boost §6) — admin only **configures placement**, never approves individual boosts.
- **Placement config:** boosted **slots per page / fixed feed positions** (e.g. 1, 6, 11) · **cap per page** so organic stays prominent · **fair rotation** among multiple boosts · **recency ordering** among boosted (identical placement across plans).
- **Honesty rules enforced:** **labelled placement, never fakes relevance** (search §4); on **home the boost is silent/no-badge** (home §11) while search shows a **"Boosted" tag** — admin config respects each surface's rule.
- **Reuse path** — admin listing rejection/removal makes the boost **reusable (remaining days)** (§6.3, boost §8); admin does not hand-tune individual boosts otherwise.

---

## 25. Anti-Abuse · Rate-Limit · Fraud Config
> Source: listing-view §10.3, report-help §5, payment §18.
- **Rate limits (configurable):** **inquiries ≤ 20/user/day** (listing-view §10.3) · **report daily cap** (anti report-bombing) · custom-number OTP verify attempts · signup/login velocity.
- **Report aggregation threshold** for **auto-hide-pending-review** (§9, §26).
- **False-report tracking** thresholds; **fraud/velocity** rules for payments (rapid-retry, mismatched-amount, benefit-abuse, anomalous attempts).
- **Blocklists** — abusive numbers/entities; **WhatsApp not-reachable cache** (skip, no pre-check API).
- All thresholds are **settings (§26)**, not code — tunable without a deploy.

---

## 26. Platform Settings & Feature Flags  *(central configuration registry — P1)*
> Per **P1**, this is the **central configuration registry** — every runtime knob lives here or in its module's editor, all **editable without a deploy**, **versioned + effective-dated + audited**, with **rollback**. The owner's named knobs live in §26.1.

### 26.1 Public-app Auth & OTP policy (admin-editable; defaults shown — admin's own login is Google-only §2)
> These govern the **public app's users** (phone-first OTP login). The **admin** never uses OTP (Google-only). All values editable; each an example default the owner named.
- **Login OTP — resend limit** = **3** resends per OTP request (then wait/cooldown). Editable.
- **OTP — request rate-limit** = **3** OTP requests per number per window (e.g. per hour/day). Editable — throttles OTP abuse.
- **OTP validity / expiry** (e.g. 5 min) · **max verify attempts** before lock · **lockout duration** · **resend cooldown** (seconds between resends). All editable.
- **Login / session validity** = **1 month** (remember-me duration before re-login). Editable, with a shorter default for admin sessions (§2).
- **Custom-number (inquiry) OTP** — verify-attempt cap + the **verified-custom-number reuse window** = **30 days** (listing-view §10.2) — editable + on/off.
- **Additional-public-number OTP** — same attempt/cooldown controls.
- Changes affect **future** OTP/login events only; never retroactively lock a valid session.

### 26.2 Listing lifecycle windows (admin-editable + on/off)
- **Pause → resume/edit WITHOUT re-approval window** = **30 days (default) + ON/OFF toggle** — the owner's rule: a listing **paused** and then edited/resumed **while still within this window (measured from when it was paused)** goes **back Live directly, no re-approval**; **past the window → re-approval** (create-listing §7, my-listings §4). Admin edits the **day count** and can **switch the whole no-re-approval allowance ON/OFF** (OFF = every resume/edit re-approves).
- **Plan live-days / expiry**, **relist-within-remaining-window** behaviour, **draft-hold** duration, **trash/soft-delete recovery window** (listings & admin-deletes, §6.5/§12.2) — all editable.
- **Boost:** expiry-soon reminder lead-time (default ~1 day, boost §10) editable.

### 26.3 Moderation, abuse & retention (editable)
- Report **auto-hide threshold** · report daily cap · inquiry **20/day** cap (listing-view §10.3) · false-report thresholds · velocity/fraud rules (§25).
- **Notification retention window** (notifications §15) · **document retention** (verification §9) · reopen-ticket window · benefit/quote expiry defaults · **per-queue SLA windows** (approval / verification / reports / tickets / payment issues) driving §4/§5/§11 breach flags.
- **Quiet hours** (push only, never leads — notifications §12).

### 26.4 Feature flags & platform toggles
- **Feature flags** — enable/disable modules & phase-2 features safely (the "nothing dead across phases" guard: a not-yet-built area is **flag-hidden**, not a dead link).
- **Maintenance mode** (§20) · gateway/mode toggles · **admin-direct-edit → re-review** default (§6.5) · **seeded-data** management (localities, featured cities, trust stats).
- Every settings change is **audited (§27)**, and each config field is itself **clickable → its history/rollback (P2)**.

---

## 27. Audit Log  *(trust backbone)*
- **Every admin write is logged immutably:** actor · action · target (user/listing/order/verification/report/ticket/setting) · **before → after** · reason · timestamp · IP/device.
- **Financial & destructive actions** (ban, remove, grant/revoke benefit, plan-price change, invoice credit-note, force-status) carry a **mandatory reason** and **re-auth** (§2).
- **Searchable/filterable**; exportable for compliance; **read-only** (no admin can edit the log).
- Complements per-entity activity histories (listing/project/order) that users partly see.

---

## 28. Analytics & Ops Reporting  *(real data only — no public view counts)*
- **Supply:** listings/projects by status, city, type; approval throughput; rejection reasons mix; RERA-verified share.
- **Demand/leads:** leads generated, repeat-inquirer rate, inquiries/day, inquiry→lead flow (**no view counts** — the product has none; metrics come from real inquiries/leads/orders, not view tracking).
- **Monetisation:** orders, revenue by context/plan, trial→paid, benefit consumption, promo usage, failed-debit/auto-reversal rates, chargebacks.
- **Trust/ops:** verification pipeline, reports/moderation outcomes, ticket SLA/CSAT, deliverability drops.
- **City inventory health** — thin-city detection feeding the marketing-band strategy (home §10, CMS §18).
- **Exports** (CSV) for finance/GST; **no paid analytics API** (near-zero-cost).

---

## 29. Admin-Originated Notifications to Users  *(closure of the loop)*
Every admin decision that affects a user emits a **clickable** user notification (notifications §7.6): `admin.benefit_granted` · `admin.listing_removed` (+ boost-reuse note) · `admin.listing_edited` (+diff, when admin directly edits a listing/project, §6.5) · `admin.profile_edited` (when admin edits/removes a profile field, §12.2) · `admin.report_outcome` (generic) · `admin.account_suspended` / `admin.account_banned` (+appeal) · `admin.announcement` · plus the domain events approvals/verification/payment already emit. New admin events register in the catalog (§22) and are **in-app + browser by default**, +email only if added to the main set. **Channel policy is fixed** (§22); a gone target degrades gracefully (§20).

---

## 30. Security, Privacy & Compliance
- **Isolation & auth-scope** — admin subdomain, **Google-only SSO** against a Super-Admin allow-list (§2); every fetch server-side auth-scoped and **role/queue-gated (§34)**; instant access revoke on de-allow-listing.
- **PII minimisation** — a lead shows only what the inquirer chose to share (leads/notifications privacy); **posters are never told who saved** their listing; **no public "N saved/viewed"** anywhere.
- **Reporter anonymity** — reported users never learn who reported (§9).
- **Documents private** — verification KYC/company docs **admin-only, encrypted, retained per policy**; only the **level/badge** is public (§8).
- **Payments** — PCI-DSS via gateway, **no raw card data stored**, RBItokenised saved methods; webhook-signature + server-side amount/order/benefit verification; **admin never sees raw card data**.
- **Financial actions** — re-auth + mandatory reason + immutable audit (§27).
- **Data-subject actions** — account delete cascade (listings + leads removed), legal-hold exceptions retained.
- **Near-zero-cost security posture** — manual RERA cross-check, seeded data, single gateway, no paid third-party data brokers.

### 30.1 India compliance, grievance & resilience  *(production)*
- **DPDP (Digital Personal Data Protection Act) alignment** — **consent records** (Terms/Privacy version accepted, when — §19), purpose-limited data use, **user data-access / correction / deletion** honoured (account delete cascade §12.2), and a documented **retention policy per data type** (leads, KYC docs, orders/invoices for statutory tax retention, notifications, audit).
- **IT-Rules Grievance Officer** — a named **Grievance Officer with published contact + acknowledged/resolution timelines** (surfaced on the **Contact/Legal page §19** and wired to **Support §11** as a priority track); user complaints/reports (§9) and their outcomes are the intake for this.
- **Data localization & security** — India-region data storage where required; **KYC/company docs encrypted at rest**, auth-scoped, admin-access-logged (§8/§12.1); PCI-DSS handled by the gateway (§30), **no raw card data stored**.
- **Backups & disaster recovery** — regular **automated backups** (DB + document store), tested **restore / DR** plan, and **point-in-time recovery** for the transactional + audit data; the **audit log is retained immutably** for the statutory window.
- **Timestamps in IST**; financial/tax exports (§28) match the GST filing calendar.

---

## 31. States & UX (admin console)
- **Per queue/list:** loading · loaded · empty ("all clear") · filtered-empty · offline · error — **never blank**.
- **Detail views:** show full context + activity history + deep-links back to the user surface.
- **Responsive** — desktop-first dense tables (primary admin surface); usable on tablet; mobile = triage (claim/approve/reply) rather than full editing.
- **Optimistic actions with undo** where safe (e.g. queue triage); **destructive/financial actions are confirmed + re-auth**, never optimistic.
- **All timestamps in IST**; relative + absolute on hover.
- **Observability** — app/error-rate, gateway/webhook health, mail/WhatsApp deliverability, and job (reconciliation) status surface on the dashboard (§4) so ops problems are visible, not silent.

---

## 32. Near-Zero-Cost Operating Rules (reflected admin-side)
- **RERA = manual admin cross-check** on the state portal (no paid RERA API).
- **Geo/localities = seeded master data** (no paid geo API); **no maps** anywhere.
- **Search/analytics = internal over own data** (no paid search/analytics API).
- **Single payment gateway** = the only paid per-transaction dependency; tax/invoicing/discounts/reconciliation/issue-handling all in-house.
- **WhatsApp/email = best-effort**, undeliverable cached/logged, never pre-checked via paid API (notifications §5.3).

---

## 33. Rules & Edge Cases (admin invariants)
- **Approval never bypassed** — first-time listings are non-public until approved; **boost never bypasses approval** (boost §11); **availability-only** project updates are the only content that skips review (L3).
- **No refund** on completed purchases — admin resolutions are fulfilment/auto-reversal/benefit-restore/invoice-correction only (§16.5).
- **Verification is trust-only** — approving/denying never gates buying or listing (§8, payment §20).
- **Slot & boost reuse on ADMIN rejection/removal only** (not on user sold/hidden/deleted) — §6.3, boost §8, my-listings L2.
- **Gone targets retained** across reports/tickets/leads/saved ("no longer available", never a dead link).
- **Editing an in-use taxonomy value / config is guarded** (versioned, migration-safe) — §17.
- **Everything editable & configurable (P1)** — plans, prices, limits, OTP/auth rules, windows, thresholds, taxonomy, copy, templates, pages, and the entities themselves (profiles, listings, projects, reviews, orders); **nothing hard-coded**; every edit **versioned/effective-dated where it's config, audited always**.
- **Everything clickable → A-Z drill-down (P2)** — no dead text or read-only dead-end anywhere in the console.
- **Admin direct edits** — publish without the owner's queue by default (admin is the reviewer), **never consume the owner's slot/quota, never charge**, always **audited + owner-notified with a diff** (§6.5, §12.2).
- **Admin-deletes are recoverable** within the configured window, then purged; **user-facing removals still follow the no-refund + slot/boost-reuse rules**.
- **Configurable windows are runtime settings** — pause→no-re-approval days (+on/off), OTP resend/rate limits, session validity, custom-number reuse, SLA/retention windows — all in §26, none in code.
- **Every admin action audited; financial/destructive re-authed** — §27.
- **Concurrency-safe & idempotent** — claim-locks, stale-action re-validation, double-submit guards; no action double-applies and no two admins silently collide (§5.1).
- **Credentials never exposed** — gateway/OAuth/mail/WhatsApp secrets are Super-Admin-only, masked, rotatable, never in cleartext audit (§2.2).
- **Launch prerequisites enforced** — taxonomy, city+localities, plans, GST config, legal & system pages, first Super Admin must be seeded before go-live (§17.1).
- **India-compliant** — DPDP consent/retention, IT-Rules Grievance Officer, IST, encrypted KYC, tested backups/DR (§30.1).
- **Reporter anonymity, document privacy, no public view/save counters** hold without exception — §30.

---

## 34. Admin Roles & Access Control  *(Super Admin · Admin · Staff)*
> RBAC is now **defined**. All three roles sign in **via Google only (§2)**; the difference is **what each may see and do**. Every action stays **audited (§27)** regardless of role.

### 34.1 The three roles (plain-language charter)
- **Super Admin** *(owner / platform-level; very few accounts)* — **full control of everything**, including the things that change money, identity, law, and the platform itself: **manage admins & staff** (add/remove Google accounts, assign roles, scope queues), **plans & pricing**, **financial/GST/invoice config**, **promo & benefit policy**, **legal & system/error/maintenance pages**, **feature flags & platform settings** (incl. the §26 config registry, rollbacks, allow-list/domain), **taxonomy/master-data structural changes**, **hard-delete accounts**, and **full audit-log access/export**. Super Admin is the **only** role that can grant/revoke admin access and change money- or law-affecting configuration.
- **Admin** *(operations manager)* — **runs the platform day-to-day** but cannot touch role-management, pricing/financial config, or legal/system pages. Can: **moderate & directly edit listings/projects** (approve/reject/changes, §6/§7, direct A-Z edit §6.5), **verification review** (§8), **reports & reviews moderation** (§9/§10), **support tickets** (§11), **user/account management** — suspend/ban/reinstate + edit/remove profile fields (§12) *(hard account-delete is Super-Admin-only)*, **grant/revoke admin benefits** (§15), **CMS content** — Help/articles/marketing (§18) *(not legal/system pages)*, **announcements** (§21), **boost placement config** (§24), **moderation/abuse thresholds** (§26.3), and **analytics** (§28). Admin **reads** plans/financial config but **cannot edit** them.
- **Staff** *(queue worker / moderator)* — **works only assigned queues**, action-scoped, mostly read-only elsewhere. Typically: **listing/verification approval** actions (approve/reject/request-changes on items in their queue), **report triage**, **support ticket replies**, and **basic user lookup (read)**. Staff **cannot**: manage account states (ban/suspend/delete), grant benefits, edit plans/CMS/legal/settings, run direct A-Z content edits beyond their moderation action *(configurable)*, see full financials, or manage roles. **High-impact actions can require Admin approval (optional maker-checker, §34.4).**

### 34.2 Capability matrix (module × role)
> **F** = full (do + configure) · **O** = operate (do, not configure) · **Q** = queue-scoped action only · **R** = read-only · **—** = no access. Everything audited (§27).

| Module | Super Admin | Admin | Staff |
|---|---|---|---|
| Manage admins/staff, roles, allow-list (§2/§34) | **F** | — | — |
| Platform settings · feature flags · config registry (§26) | **F** | R (thresholds §26.3 = O) | — |
| Plans · pricing · boost-plans · trials (§13) | **F** | R | — |
| Promo codes (§14) | **F** | O | — |
| Admin-granted benefits (§15) | **F** | **O** | — |
| Payments · billing · reconciliation · disputes (§16) | **F** | O (resolve issues; no config) | R (assigned tickets) |
| GST / invoice-series / tax config (§16.1) | **F** | R | — |
| Listing/project moderation & approval (§6/§7) | **F** | **O** | **Q** |
| Admin DIRECT A-Z edit of listing/project (§6.5) | **F** | **O** | — *(or Q, configurable)* |
| Verification review (§8) | **F** | **O** | **Q** |
| Reports & moderation (§9) | **F** | **O** | **Q** |
| Reviews moderation (§10) | **F** | **O** | **Q** |
| Support tickets (§11) | **F** | **O** | **Q** (reply) |
| User 360 view (§12.1) | **F** | **O** | R |
| Edit/remove profile fields; suspend/ban/reinstate (§12.2/§12.3) | **F** | **O** | — |
| **Hard-delete account** (§12.2) | **F** | — | — |
| Master data & taxonomy (§17) | **F** | R (values = O; structure = —) | — |
| CMS — Help/articles/marketing (§18) | **F** | **O** | — |
| **Legal / system-error / maintenance pages** (§19/§20) | **F** | — | — |
| Announcements / broadcast (§21) | **F** | **O** | — |
| Notification catalog · templates (§22) | **F** | O (templates) | — |
| SEO (§23) | **F** | **O** | — |
| Boost placement config (§24) | **F** | **O** | — |
| Anti-abuse / rate-limit / fraud config (§25/§26.3) | **F** | **O** | — |
| Analytics & ops reporting (§28) | **F** | **O** | R (own queues) |
| Audit log (§27) | **F** (all + export) | R (ops scope) | — |

*(Cells marked "configurable" are Super-Admin-tunable defaults; the matrix itself is data the Super Admin can adjust — the roles are fixed, the fine-grained grants are editable per P1.)*

### 34.3 Scoping, assignment & lifecycle
- **Assignment** — only **Super Admin** adds a Google account to the allow-list and sets its role; **Staff** are additionally bound to **specific queues** (approval / verification / reports / support) so the Work Queue (§5) shows each staffer only their lane.
- **Least privilege by default** — a new admin starts as **Staff** with no queues until assigned.
- **Instant revoke** — removing the Google account (or disabling it in Google) ends access immediately and invalidates sessions (§2).
- **Self-safety** — a Super Admin can't remove/downgrade the **last** Super Admin (lock-out guard); role changes are audited and notify the affected admin.
- **Admin directory** — a Super-Admin view listing every admin: Google identity · role · assigned queues · added-by · **last-active** · status, with **revoke / change-role / re-scope** actions (audited). This is where day-to-day access management happens after bootstrap.

### 34.4 Maker-checker (optional, Super-Admin-toggle)
- High-impact actions (**ban/hard-delete account, plan-price change, benefit grant above a threshold, bulk removal, config rollback**) can require a **second admin's approval** before they commit. Toggleable per action-class in §26.4; every step audited. Off by default; recommended on for financial/destructive classes.

### 34.5 Still Phase-2 (genuinely later)
- **Team/sub-user access for builders** (sales staff updating only availability) — my-project+inventory phase-2 (a *user-side* delegation, distinct from admin RBAC).
- **Advanced analytics / BI**, cohort funnels, A/B config — beyond §28's real-data ops reporting.
- **Automated RERA-portal integration** — only if a free/official endpoint ever exists; stays manual (§32).
- **Inventory Hold/Blocked status, snapshot-versioning** — forward-compatible via §17 + §22.

---

## 35. Excluded from the Admin Panel
- **Shared login with the public app** — admin is isolated.
- **User-facing halves of flows** — admin produces outcomes + deep-links; the flows themselves live on their screens.
- **Cash refunds / a refund engine** — do not exist (auto-reversal is a bank event).
- **Referral / credit / wallet** admin — no such system exists (only §15 benefits).
- **Public view/save counters, maps, EMI/loan widgets, brokerage** — none exist product-wide.
- **Paid third-party API integrations** (RERA/geo/search/analytics) — near-zero-cost.
- **Admin email/password or OTP/phone login** — admin sign-in is **Google-only** (§2); no admin OTP exists (OTP is the public app's user mechanism).
- **Admin self-registration** — accounts exist only via the Super-Admin allow-list (§2/§34).

---

## 36. Cross-screen Consistency
- **Approval / lifecycle** ↔ create-listing §7, my-listings §4/§11/§12 (L1/L2/L3).
- **Project inventory lanes (instant vs revision)** ↔ my-project+inventory.
- **Verification (tiered, optional, private docs)** ↔ verification, edit-profile §3/§7.
- **Reports/moderation reasons + aggregation + anonymity** ↔ report-help §4–6, leads §4.3, view §11, public-profile §9.
- **Reviews eligibility + screening** ↔ public-profile §8.
- **Support tickets + payment-issue unification + locked-out path** ↔ report-help §7–8, payment §14, auth account-status.
- **Plans/benefits/promos/trials** ↔ payment §3–4, boost §3.
- **Payments/reconciliation/no-refund/chargebacks** ↔ payment §12–18.
- **Boost auto-activate + reuse + placement honesty** ↔ boost §6/§8/§12, search §4, home §11.
- **Taxonomy/geo master** ↔ create-listing §3/§5/§6, search §3, home §4.
- **Notifications (admin feed + admin-originated + catalog governance + channel policy)** ↔ notifications §4/§5/§14/§18.
- **Legal footer links + acceptance** ↔ home §6L, edit-profile §5.5.
- **Error/tombstone/maintenance graceful fallback** ↔ notifications §9, saved §7, leads §5, product-wide.
- **No maps · INR/GST · EN-GU-HI (public) · near-zero-cost · Made in India** ↔ product-wide.

---

## 37. Referenced Screens (defined elsewhere)
- **create-listing** (lifecycle, taxonomy, RERA) · **my-listings** (L1/L2/L3, status model, appeals) · **my-project+inventory** (edit lanes, RERA-per-phase, exposure) · **listing view** (report origin, inquiry rate limit) · **leads / inquiry** (report origin, relist trigger) · **verification** (tiered review source) · **edit profile / public profile** (account states, badges, reviews, acceptance) · **payment** (plans, benefits, orders, disputes, no-refund) · **boost** (auto-activate, reuse, placement) · **report / flags / help** (report form, tickets, FAQ) · **saved · search · home** (SEO, marketing bands, boost placement, footer/legal) · **notifications** (engine, admin feed, catalog, channels) · **login / register** (phone-first, account-status support) · **legal/policy pages** & **system/error pages** (managed here).

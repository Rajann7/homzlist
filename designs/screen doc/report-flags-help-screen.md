# Report, Flags & Help — Specification

> The single user-facing screen for **flagging problems** (reporting a listing, profile, lead, or review to moderation) and **getting help** (self-service FAQ + support tickets + contact channels). The *Report* action lives contextually on each entity (listing / profile / lead / review) and is defined there; **this screen owns the report form, report tracking, the Help Center, and the ticket / support system**. Reports fan out to admin moderation (`admin.report.filed`); tickets fan out to the admin support queue. **Login is required to report;** the Help Center and Contact Support are reachable by **guests** and by **locked-out (banned / suspended) accounts**. Support channels: **in-app ticket · email · WhatsApp**. No maps · PWA · EN / GU / HI · "Made in India".

---

## 1. Purpose & Scope
- Two jobs on one screen: **(1) Report / Flag** content or users to moderation; **(2) Help & Support** — self-service FAQ + tickets + contact.
- **In scope:** the report form + per-entity reasons + evidence; My Reports tracking; Help Center / FAQ; ticket creation + threaded My Tickets; contact channels; the banned / locked-out support path; anti-abuse; notifications; privacy; states.
- **Out of scope (elsewhere):** the contextual **Report button** on cards / entities (origin defined there); admin **moderation & support queues** (admin subdomain); **notification preference toggles** (Edit Profile §5.3).

---

## 2. Structure & Entry Points
- **Two tabs:** **Help & Support** · **My Reports**.
- **Entry points:** Profile menu · footer / help link · account-status **"Contact Support"** (banned / suspended) · Payment **"report a payment issue"** (with Order ID) · notification deep-links (report-status / ticket-reply) · the contextual **Report** action (opens the report form; tracked here).

---

## 3. Roles & Access
- **All logged-in roles** can report and use support.
- **Guests:** Help Center / FAQ open; **Contact Support open** (a contact form using their entered number); **reporting content is login-gated**.
- **Banned / Suspended / Temp-blocked:** locked out of the app but can reach a **limited Contact Support** path (§7.4) — the only surface available to them.

---

## 4. Report / Flag — Form
- The report is **pre-scoped** to the entity it was launched from (listing / profile / lead / review), with its **reference auto-attached** (type + ref ID).
- **Reason (entity-specific, required):**
  - **Listing:** spam · fraud / scam · already sold / rented · wrong / misleading info · duplicate · offensive · wrong location / price.
  - **Profile:** fake / impersonation · spam · fraud · offensive · wrong info.
  - **Lead / inquirer:** fake · spam · abusive / harassment · wrong number.
  - **Review:** fake · spam · offensive · irrelevant.
- **Optional details** — free-text, char-limited.
- **Optional evidence** — screenshot / image attachment.
- **Submit** → creates a moderation report (`admin.report.filed`) → confirmation + a short "what happens next".
- **Cannot report your own content.**

---

## 5. Report Rules & Anti-Abuse
- **Login required** to report.
- **One report per user per entity** (dedupe — re-reporting the same item updates it, never duplicates).
- **Rate-limited** — a sane daily cap on reports per user (anti report-bombing).
- **False-report tracking** — repeat false / malicious reporters are flagged and can be limited (admin-side).
- **Aggregation (admin-side)** — many reports on one entity roll up into a flag count + priority; a high threshold may auto-hide the item pending review (admin-configurable). The user only ever sees / manages **their own** report.

---

## 6. My Reports (tracking)
- List of the user's submitted reports: entity (type + ref) · reason · date · **status**.
- **Status:** Submitted → Under review → Actioned / Dismissed → Closed.
- **Outcome visibility (limited):** a generic result only — "Reviewed — action taken" / "Reviewed — no violation found" — never internal detail or what happened to the other user (privacy).
- **Withdraw** allowed **only while Submitted** (before review starts); not after.
- **Reporter anonymity** — the reported user never learns who reported.
- Status changes **notify** the user (in-app + browser) and **deep-link** here.
- **Empty state** when no reports.

---

## 7. Help & Support

### 7.1 Help Center / FAQ (self-service first)
- **Searchable, categorized** FAQ: posting · payments / plans / boost · verification · leads / inquiries · account · technical.
- **Contextual help** — surfaces articles relevant to where the user came from.

### 7.2 Raise a Ticket
- **Category:** account · payment · listing · verification · technical · report a bug / feedback · other.
- **Description** · **attachments** · **related reference** auto-linked when applicable (Order ID / listing / etc.).
- **Urgent / safety** categories (harassment, fraud) are flagged higher priority.

### 7.3 My Tickets
- List + **status:** Open · In progress · Resolved · Closed.
- **Threaded conversation** — support replies and user replies inline.
- **Reopen** a Resolved ticket within a window; optional **rate the resolution** (CSAT).
- Ticket updates **notify** the user (in-app + browser) and **deep-link** here.

### 7.4 Contact Channels & Locked-out Path
- Channels: **in-app ticket (primary) · email · WhatsApp** (consistent with Payment & account-status).
- **Response-time expectation** shown (typical reply window).
- **Banned / Suspended / Temp-blocked users** reach a **minimal Contact Support** (their number is already known; email / WhatsApp shown) even while locked out.

---

## 8. Payment-Issue Unification
- "Report a payment issue" (Payment §14) creates a **support ticket** in this system — **category = Payment, linked to the Order ID** — tracked in My Tickets, so all support lives in one place.

---

## 9. Notifications Integration
- **Report-status changes** and **ticket replies** are notification events — **in-app + browser** by default (email only if added to the main set), each **deep-linking** to the exact report / ticket here.
- Throttled / de-duped like all notifications.

---

## 10. Privacy & Security
- **Reporter identity is hidden** from the reported party.
- Every report / ticket fetch is **auth-scoped server-side** to the owner; a user sees only their own.
- Reports / tickets carry the minimum necessary; sensitive detail stays behind login.

---

## 11. Accessibility, Performance, Language
- Labelled controls, keyboard operable, visible focus, adequate tap targets; state never signalled by colour alone.
- Paginated lists, skeleton loaders, branded placeholders.
- All copy in **EN / GU / HI**.

---

## 12. PWA / Offline
- Help Center and previously loaded reports / tickets are viewable **offline** (cached), marked "offline — last updated …".
- New reports / tickets / replies submit online; queued optimistically and synced on reconnect where possible.

---

## 13. Data & States
- **Screen states:** loading · loaded · empty · filtered-empty · offline · error.
- **Report record:** entity ref + type · reason · details · evidence · status · timestamps.
- **Ticket record:** category · description · attachments · related ref · status · thread · timestamps.

---

## 14. Rules & Edge Cases
- Can't report own content; **one report per entity** (dedupe); **withdraw only while Submitted**.
- **Rate-limited** reporting; false-report tracking.
- **Guest:** FAQ + Contact Support only; reporting login-gated.
- **Locked-out accounts:** minimal Contact Support only.
- **Deleted / removed target:** the report / ticket **persists** with a "no longer available" reference (never a dead link) — same retain-not-drop principle as leads / saved.
- **Near-zero-cost:** no paid live-chat — async tickets + self-service FAQ; **EN / GU / HI**; no maps.

---

## 15. Excluded from this Screen
- The contextual **Report button** on cards / entities (origin defined there).
- **Admin moderation & support queues** (admin subdomain — they receive the reports / tickets).
- **Notification preference toggles** (Edit Profile).
- No live chat · no maps · no view / report public counters.

---

## 16. Cross-screen Consistency
- **Report reasons** ↔ view-screen report (listing) · public profile (profile / review) · leads §4.3 (lead).
- **Report / ticket events** ↔ notification engine (in-app + browser default, clickable; `admin.report.filed` to admin feed).
- **Contact channels** ↔ Payment §14 + account-status (in-app ticket · email · WhatsApp).
- **Locked-out support** ↔ auth account-status screens.
- **Retain-not-drop** for gone targets ↔ leads §5 / saved §7.
- **Language / PWA / no-maps** ↔ product-wide.

---

## 17. Referenced Screens (defined elsewhere)
- **listing view** (report origin) · **public profile** (report origin: profile / review) · **Leads / Inquiry** (report origin: lead) · **Payment / orders** (payment-issue → ticket) · **login / register** (account-status Contact Support, guest gate) · **Edit Profile** (notification prefs) · **admin** (moderation queue, support queue).

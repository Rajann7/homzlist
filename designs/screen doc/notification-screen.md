# Notifications — Specification

> The user's in-app **notification centre** and the **event-driven engine** behind it. It surfaces **every automatic (system) notification** across Homzlist for **all recipients** — Buyer / Broker / Developer-Builder users **and** admin / staff — and is built so that **any new feature's notifications work automatically**: the feature registers its event in one central catalog and the engine fans it out, makes it **clickable (deep-linked)**, and applies the **channel policy**. **Channel policy (core):** the **in-app centre** and **browser / device push** carry **ALL** notifications; **WhatsApp** (from the company number) carries **leads only**; **email** carries a **limited "main" set** only. Email and WhatsApp are **optional add-on channels** — a user with **no email on file** or a **non-WhatsApp number** simply doesn't receive on those, with **no error and nothing lost** (in-app + browser always carry everything, because phone-first login means every account has a verified number). **Every notification is clickable** — no dead notifications. No maps · PWA · "Made in India".

---

## 1. Purpose & Scope
- One **notification centre** (this screen) + one **notification engine** serving the whole product.
- **In scope:** the engine (event bus → catalog → fan-out), the **channel matrix** (§5), the full **event catalog A-to-Z** with per-event channels (§7), the centre UI, read/unread & badges, deep-link (clickable) behaviour, throttling / batching, real-time & push, admin/staff inbox, extensibility guarantee, privacy, states.
- **Out of scope (elsewhere):** the **notification *preference* toggles** (Edit Profile §5.3 — linked from here); email / WhatsApp **template & campaign** tooling (admin/infra); destination screens (linked, not specced here).
- **Login required** — no persistent feed for guests; a guest's pending action resumes after login (§19).

---

## 2. Recipients & Feeds (role-scoped)
- **One engine, recipient-scoped feeds** — each recipient sees only events addressed to them:
  - **Buyer / Broker / Developer-Builder** → a **role-filtered** personal feed.
  - **Admin / Staff** → an **admin feed** on the isolated admin subdomain (account.homzlist.com), scoped by staff role/queue (§14).
- **Guest** → no stored notifications; the login gate captures the intended action and resumes it.
- Same anatomy, engine, clickable rule, and channel matrix apply to every feed; only the recipient resolver differs.

---

## 3. Notification Anatomy (the schema that makes new events "just work")
Every notification is one record with a fixed shape:
- **event_key** (stable id, e.g. `listing.approved`, `lead.received`, `payment.failed`).
- **category** (§6) · **priority** (critical / transactional / informational / marketing).
- **title** · **body** · **icon** (category-derived).
- **recipient** (resolved from the event) · **actor** (shown as "Homzlist" / "Admin" — never a raw internal id).
- **related entity** (listing / lead / order / profile ref) + **deep-link target** — **mandatory; a notification cannot exist without a valid, clickable destination** (§9).
- **channels** — computed from the event's **channel class** (§5) ∩ the user's allowed channels; recorded as **channels_sent**.
- **created_at** · **read/unread** · **dedupe key** (§12).
- **Forward-compatible:** an unknown/new event_key still renders via a **safe default template** (title + body + deep-link) and defaults to **in-app + browser** only.

---

## 4. Event-Driven Engine & the "new feature → auto notification" Guarantee
- **Central event bus + notification catalog (registry).** Every feature **publishes an event**; it never calls email/WhatsApp/in-app directly.
- A **catalog entry** declares: **recipient resolver · template · category · priority · channel class (§5) · deep-link builder**.
- The **notification service** subscribes, and per event: resolves recipient → renders template → applies **channel class ∩ user prefs** → writes the in-app record → fans out to browser push / email / WhatsApp. **Fan-out is idempotent with retries**; a failed channel never blocks the others; **the in-app record is the source of truth**.
- **Definition-of-Done for any new feature = register its events.** Default channel class = **in-app + browser** (all). An event only reaches **WhatsApp** if it is classed **leads**, and only reaches **email** if it is in the **email-main** set — so new features are auto-visible in-app + browser + clickable, without silently spamming email/WhatsApp.
- **Governance:** a build check rejects any event missing a recipient resolver or deep-link, so the catalog stays the complete, auditable inventory of every notification (answers the "nothing dead / missed" worry).

---

## 5. Channel Matrix (core policy)

| Channel | Which notifications | Notes |
|---|---|---|
| **In-app notification centre** (same record in the **app AND the browser**) | **ALL** events | Always on; free; the durable source of truth. This screen. |
| **Browser / device push** (web push + app push) | **ALL** events (mirrors in-app) | Permission-based; if the user denies push, everything is still in the centre. |
| **WhatsApp** (from the **company number**) | **LEADS ONLY** — `lead.received` (new inquiry) | "WhatsApp leads" promise; nothing else on WhatsApp; immediate, never batched. **Sent only if the recipient's number is on WhatsApp** — else skipped silently (§5.3). |
| **Email** | **LIMITED "main" set only** (§5.1) | High-value / transactional / account events only; everything else is **not** emailed. **Sent only if an email is on file** — else skipped silently (§5.3). |

### 5.1 Email "main" set (the only things emailed)
- **Leads:** `lead.received`.
- **Listings (actionable):** `listing.approved`, `listing.rejected`, `listing.changes_requested`, `listing.expiring_soon`, `listing.expired`.
- **Payments / plans / boost (transactional & renewal):** `payment.success` (+ invoice), `payment.failed`, `payment.reversed`, `payment.invoice_ready`, `payment.issue_status_changed`, `plan.expiring_soon`, `plan.expired`, `boost.expiring_soon`, `boost.reusable_available`.
- **Account / verification / security:** `verification.verified`, `verification.rejected`, `number.changed`, `profile.flagged_for_review`, `admin.account_suspended`, `admin.account_banned`, `admin.benefit_granted`, `admin.listing_removed`.
- **Everything not listed here is in-app + browser only** (e.g. saved price/went-live, `boost.activated`, `inquiry.sent`, `lead.repeat_inquirer`, `listing.renewed`, sold/rented/withdrawn confirmations).

### 5.2 Cost & priority alignment
- **In-app + browser are free → carry everything.** **WhatsApp (paid, highest-value) → leads only.** **Email (limited) → main set only.** This keeps running cost near-zero while the most valuable event (a new lead) reaches every channel.
- **Priority tiers** (critical / transactional / informational / marketing) drive **immediacy vs batching** (§12), not channel — channel is fixed by the matrix above.

### 5.3 Channel Availability & Graceful Degradation (no email / no WhatsApp)
> Phone-first login means **every account has a verified phone number**, so **in-app + browser always work with nothing else required**. Email and WhatsApp are **best-effort add-ons**; a missing capability is **never an error and never loses a notification**.

- **Availability resolution before fan-out** — the engine computes the deliverable channels per recipient: **in-app** (always) · **browser push** (if permission granted) · **email** (only if a **valid email is on file**, the event is in the main set, and not opted out) · **WhatsApp** (only if the account's number is **WhatsApp-reachable**, the event is a lead, and not opted out). Any unavailable channel is **skipped silently** — no failure state.
- **No email on file →** email is skipped; the notification is still fully present **in-app + browser** (+ WhatsApp if it's a lead and reachable). **No error, no block, nothing missed.**
- **Number not on WhatsApp →** WhatsApp is skipped even for a lead; the lead is still **in-app + browser + the Leads inbox** (+ email if on file). **A lead is never lost to a missing channel** — the Leads screen is its guaranteed home.
- **Neither email nor WhatsApp →** the user still receives **100% of notifications** via in-app + browser. Nothing breaks anywhere.
- **Best-effort delivery** — an email bounce / undeliverable WhatsApp is **retried a few times, then dropped and logged for ops**, **never** surfaced to the user as an error. An undeliverable WhatsApp number is **cached as not-reachable** so future sends skip it (no pre-check API needed — respects the near-zero-cost rule).
- **WhatsApp target = the account's primary (login) number**; inquiry-time **custom contact numbers are contact-only** and are never used to send the user their own notifications.
- **Optional, dismissible nudge (never blocking)** — the app *may* gently suggest "add an email to receive invoices & important updates" or "add a WhatsApp number for instant lead alerts", purely to unlock more reach; declining changes nothing and raises no error.
- **Login OTP is separate** (handled by auth), not part of this engine.

---

## 6. Categories (grouping & filter)
Every event maps to one category; feeds are filterable by it: **Listings · Leads/Inquiries · Payments·Plans·Boost · Saved · Account·Verification · Admin/System** (+ **Queues** on the admin feed, §14). The category sets the icon; the **channel matrix (§5)** — not the category — decides delivery.

---

## 7. Full Event Catalog — A-to-Z
> Every event below is **in-app + browser** by default. Extra channels are tagged: **(+email)** = in the email-main set; **(+WhatsApp)** = leads. New events append here.

### 7.1 Listings (to the poster)
- `listing.submitted` → "Received for review" → the listing.
- `listing.approved` **(+email)** → "Your listing is live" → the live listing.
- `listing.rejected` (reason) **(+email)** → edit & resubmit → the listing in edit.
- `listing.changes_requested` **(+email)** → what to fix → the listing in edit.
- `listing.under_re_review` → the listing.
- `listing.expiring_soon` **(+email)** / `listing.expired` **(+email)** → renew flow.
- `listing.renewed` / `listing.relisted` → the listing.
- `listing.sold_marked` / `listing.rented_marked` / `listing.withdrawn` → confirmation → the listing.

### 7.2 Leads / Inquiries
- `lead.received` (to poster) **(+email) (+WhatsApp)** → **deep-links to that specific lead** (leads §6). WhatsApp from the company number, immediate.
- `lead.repeat_inquirer` (to poster) → the lead, flagged.
- `inquiry.sent` (to sender) → confirmation → Inquiries-Sent.
- `inquiry.target_unavailable` (to sender) → the sent-inquiry record.

### 7.3 Payments · Plans · Boost
- `payment.success` **(+email, invoice)** / `payment.failed` **(+email)** / `payment.verifying` / `payment.reversed` **(+email)** → the order.
- `payment.invoice_ready` **(+email)** → download invoice.
- `payment.issue_status_changed` **(+email)** → the issue/order.
- `plan.expiring_soon` **(+email)** / `plan.expired` **(+email)** → renew.
- `boost.activated` / `boost.expiring_soon` **(+email, ~1 day before)** / `boost.ended` / `boost.paused` / `boost.resumed` → the boost / listing.
- `boost.reusable_available` **(+email)** (admin reject/remove) → apply reusable boost (boost §8).

### 7.4 Saved  *(in-app + browser only — never email / WhatsApp)*
- `saved.price_drop` / `saved.price_rise` (throttled) → the saved item.
- `saved.went_live` → the item.
- `saved.sold_unavailable` → the item (tombstone).

### 7.5 Account · Verification
- `verification.pending` → verification screen.
- `verification.verified` **(+email)** / `verification.rejected` **(+email, reason + re-apply)** → verification screen.
- `number.changed` **(+email, security)** / `number.added_verified` → profile.
- `profile.flagged_for_review` **(+email)** → profile.

### 7.6 Admin-originated (to the user)
- `admin.benefit_granted` **(+email)** (free listing / boost / trial) → payment/benefit screen.
- `admin.listing_removed` **(+email, reason; + boost-reuse note)** → the listing.
- `admin.report_outcome` → the reported/owned item.
- `admin.account_suspended` **(+email)** / `admin.account_banned` **(+email, reason / appeal)** → account.
- `admin.announcement` → the announcement/target (email only if the admin flags it important).

---

## 8. Notification Centre (screen UI) — works identically in app & browser
- **Entry:** the **bell** in the top app bar (+ optional bottom-nav) with an **unread count badge** (99+ cap).
- **List:** newest first, grouped **Today / Earlier** (or by category tab); each row = **icon · title · body snippet · relative time · unread dot**, the **whole row clickable** to its deep-link (§9).
- **Category filter/tabs** (§6) + **Unread-only** toggle.
- **Actions:** mark read / unread · **mark all read** · dismiss / clear · multi-select.
- **Settings shortcut** → Edit-Profile notification preferences.
- **Pagination / infinite scroll**; **empty · offline · error** states (§16).
- **Same centre, same records** whether opened in the installed app or a desktop/mobile browser — identical, complete list in both.
- **Responsive:** mobile full-screen; tablet/desktop panel or page per the app's 3-layout system.

---

## 9. Clickable / Deep-Link Behaviour (mandatory — no dead notifications)
- **Every notification routes to its exact target** (lead detail, listing view, payment order, verification, saved item, admin queue item). The deep-link is schema-required (§3), so a notification **can never be un-clickable**.
- **Opening marks it read** (and syncs, §10).
- **Target gone** → **graceful fallback** (tombstone / parent screen + "no longer available") — never a dead click or error page.
- **Session expired** → login gate → **return to the same target**.
- **Cross-channel parity:** the browser-push / email / WhatsApp version links to the **same in-app target**.

---

## 10. Read / Unread & Badges
- **Unread count** on the bell + (optional) bottom-nav, and **per-category** unread counts.
- **Marked read** on open or via mark-(all)-read; unread state **syncs across devices AND between app and browser** (last-write-wins) — reading in the browser clears it in the app and vice-versa.
- Consistent with **Leads unread badges** (tab / listing / lead) — the lead badge and the `lead.received` notification are two views of the same unread lead.

---

## 11. Preferences Integration
- **In-app is always on** (durable record) and cannot be disabled.
- **Browser / device push** is governed by **device/browser permission** (grant / deny); denying push never removes the in-app record.
- **WhatsApp** only ever sends **leads**; its toggle (Edit-Profile §5.3) turns the **lead WhatsApp alert** on/off.
- **Email** sends only the **main set** (§5.1); the **lead-alert email** and other non-essential emails are togglable, while **transactional receipts and account-security emails remain essential** (not fully opt-out). **Marketing email is opt-in only.**
- **Per-category mute (optional)** applies to browser push (and the lead email/WhatsApp), never to the in-app record of critical/transactional events.
- **Availability-aware toggles** — if no email is on file, the email toggle shows an "add an email to enable" hint (not a broken/erroring control); if the number isn't on WhatsApp, the WhatsApp (lead-alert) toggle hints the same. Both stay optional; neither ever blocks the user or errors (§5.3).
- Preference changes affect the **next** event, never past records.

---

## 12. Throttling, Batching & De-duplication
- **De-dupe** by dedupe-key — identical events collapse to one.
- **Throttle / batch** noisy low-priority streams — repeated saved price wobbles → one alert or a **digest** (in-app + browser only, since Saved isn't emailed/WhatsApped).
- **Leads are never batched** — `lead.received` fires immediately on every channel it uses (in-app, browser, email, WhatsApp).
- **Priority-driven immediacy:** critical/transactional send at once; informational may digest. **Quiet hours (optional)** for push only, never for leads.
- Goal: a useful, un-spammy feed with controlled email/WhatsApp spend.

---

## 13. Real-time & Push
- In-app notifications appear **near-real-time** (lightweight polling / socket, cost-aware); unread state syncs across app + browser + devices.
- **Browser / device push carries ALL events** (permission-based) — this is how "everything shows in the browser too" is delivered outside the open tab; if permission is denied, the centre still has everything.
- **Offline (PWA):** the last-loaded feed is viewable offline (cached), marked "offline — last updated …"; new events + read-state reconcile on reconnect.

---

## 14. Admin / Staff Notification Inbox
- **Same engine, admin-side feed** on account.homzlist.com; **role/queue-scoped**. **Channels for staff = in-app (admin console) + browser push**; **limited email digests** for high-priority ops only; **no WhatsApp** for staff.
- **Admin events (A-Z):**
  - `admin.listing.pending` (new in approval queue) · `admin.listing.re_review` (edited-live).
  - `admin.verification.requested` (new broker/builder verification).
  - `admin.report.filed` (new report/flag on listing / lead / profile / review).
  - `admin.payment.issue_raised` · `admin.payment.chargeback`.
  - `admin.ops.*` (queue backlog, failed webhook reconciliation, RERA anomaly).
  - `admin.staff.assigned` / `admin.staff.escalated`.
- **Clickable** → the exact admin queue item; **claim / assign**, **priority / SLA**, and **mark-handled = doing the action** (not just dismissing).
- Admin feed is **isolated** from user feeds (separate subdomain + auth scope).

---

## 15. Retention & Lifecycle
- Notifications persist a **defined window**, then **auto-archive**; **clear-all / dismiss** available.
- **Unread never auto-clears** by time (only user or on open).
- Read + archived records retained per data-retention policy; the deep-link target's own lifecycle governs the fallback (§9).

---

## 16. Data & States
- **Screen states:** loading · loaded · empty · filtered-empty · offline · error.
- **Empty:** "You're all caught up" + a hint of what appears here — never blank.
- **Per record:** the full §3 schema (event_key, category, priority, title, body, recipient, actor, related entity, deep-link, channels_sent, created_at, read state, dedupe key).

---

## 17. Security & Privacy
- Every feed fetch is **auth-scoped server-side**; a user sees only their own; the **admin feed is isolated**.
- **No leakage:** a `lead.received` shows only what the inquirer chose to share (inquiry privacy rules); no internal ids.
- **Email / WhatsApp payloads** carry the minimum + a deep-link; sensitive detail stays behind login.
- Posters are **never** told who saved their listing (matches the no-public-save-counter rule).

---

## 18. Extensibility Guarantee (restated)
- **Adding a feature = adding its catalog entries.** New events are **in-app + browser + clickable automatically**; they reach **WhatsApp only if classed `leads`** and **email only if added to the main set (§5.1)** — so the limited email/WhatsApp policy holds even as features grow.
- The **schema enforces recipient + deep-link**, and a **build check** blocks any event missing them, so a new feature can **never** ship a notification that's missing, dead, or un-clickable, and the **catalog stays the complete inventory**.

---

## 19. Rules & Edge Cases
- **Role-filtered:** each recipient gets only applicable events.
- **Guest:** no persistent feed; intended action captured and resumed post-login.
- **Deleted/expired target:** graceful fallback, never a dead click (§9).
- **Multi-surface:** read/unread + delivery reconcile last-write-wins across app, browser, and devices.
- **Unknown/new event_key:** safe default template, in-app + browser, still clickable.
- **Muted category:** keeps the **in-app** record for critical/transactional; only push / the lead email·WhatsApp are suppressed.
- **WhatsApp = leads only**, from the **company number**; **email = main set only**; **in-app + browser = everything**.
- **No email / non-WhatsApp number →** that channel is **skipped silently, no error, nothing lost** — in-app + browser always deliver, and every lead also lands in the Leads inbox (§5.3).
- **Language** EN / GU / HI per the app UI.

---

## 20. Cross-screen Consistency
- **Bell + unread badge** → home §9.
- **Channel toggles** → Edit-Profile §5.3 (lead alerts: in-app / email / WhatsApp).
- **Lead deep-link + all-channel lead alert** → Leads §6 + listing-view §10.4 (in-app · email · WhatsApp from company number).
- **Listing states** → create-listing §10.
- **Boost alerts** → boost §10.
- **Payment alerts** → payment spec.
- **Saved alerts** → saved §9 (in-app + browser only, throttled).
- **Verification states** → edit-profile §3.
- **Admin actions** → admin.

---

## 21. Referenced Screens (defined elsewhere)
- **Edit Profile** (notification preferences) · **home** (bell) · **Leads / Inquiry** · **listing view / detail** · **create-listing** · **Boost** · **Payment / orders** · **Saved** · **verification flow** · **login / register** (guest resume) · **admin** (approval, verification, moderation, disputes, announcements — source of admin-originated & admin-feed events).

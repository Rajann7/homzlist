# Billing — Specification  *(My Plans & Slots + Payment History)*

> **Short name: "Billing".** The logged-in user's **financial & entitlements hub** — what they currently **HAVE** (active per-listing plans, remaining free slots & boost-days, trial status, admin-granted benefits) and everything they've **PAID** (lifetime orders + GST invoices + reversals + issue reporting). The **checkout** screen (payment) surfaces only the *recent* set; **THIS screen is the lifetime hub.** **Not a wallet** — no cash balance, no refunds, **no auto-renew / auto-charge anywhere**; balances are **admin-granted entitlements with no cash value**. Login required, own account only. INR · GST · PWA · EN / GU / HI · India.

---

## 1. Purpose & Scope
- **One screen, two tabs:** **My Plans & Slots** (entitlements) + **Payment History** (orders / invoices), preceded by an **at-a-glance summary**.
- **In scope:** summary; active per-listing plans + inclusions + expiry / renew / grace; free slot & boost-day balances (granted / used / remaining); trial status; admin benefits / promo (incl. revocation of unused); reusable boost-days; lifetime order list + filters + order detail; GST invoice archive + reissue + export; saved billing / GSTIN; reversal tracking + overdue escalation; report-payment-issue entry; notifications; accessibility; states.
- **Out of scope (elsewhere):** the checkout / pay flow (payment screen); boost activation & live status (boost screen); admin grant / revoke & reconciliation (admin); the support-ticket thread (Report / Help — this screen only launches the issue).
- **Not a wallet** — no cash balance, no refunds, no stored payment mandate; entitlements only.

---

## 2. Structure, Summary & Access
- **At-a-glance summary strip** (top): active plans count · free slots remaining · boost-days remaining · trial status · anything expiring soon. One tap → the relevant section.
- **Two tabs:** My Plans & Slots · Payment History.
- **Entry:** profile menu · checkout "recent orders → view all" (payment §17) · notification deep-links (plan / slot / boost expiring · invoice sent · reversal done · admin granted a benefit).
- **Login required;** Buyer/Broker & Developer/Builder (role-appropriate plans); guest → login gate.
- **No auto-renew / auto-charge / stored mandate** anywhere — every renewal is a deliberate, one-off purchase.

---

## 3. Tab 1 — My Plans & Slots (entitlements)

### 3.1 Active plans (per listing)
- Plans are **per-listing** (not an account subscription). Each active listing shows: listing (**thumb · title · ref**) · **plan + what it grants** (live-days, inclusions) · **live-days remaining** · expiry date · **Renew** CTA.
- **Filter / sort** plans by status · expiry (soonest first) · listing.
- **Renew timing:** renewing **before** expiry **extends** the same listing's live window; **after** expiry the listing is Expired → **Relist / Renew** (a fresh plan, re-approval). A short **grace window** may be shown before it drops.
- **Upgrade / downgrade** a listing's plan applies only where offered (via checkout); **no refund** on any downgrade.
- **No bulk renew** — single-item checkout (payment): renew one listing at a time.

### 3.2 Free listing slots
- **Granted / used / remaining** breakdown · **grant source** (admin) · expiry · "use to post" CTA. **No cash value.**

### 3.3 Boost days *(entitlement balance, not a running boost)*
- **Free boost-days** (admin-granted) **+ reusable boost-days** (carried over from an admin-rejected boosted listing, boost §8): granted / used / remaining · expiry · **"apply on Boost"** link.
- **Note:** these are **spendable balances**; a **running** boost (Active, days-left) lives on the **Boost** screen.

### 3.4 Trial
- Status: **Available · Active · Used · Expired** · what it grants · duration · ends-on. **Never auto-charges / auto-renews**; when it ends the user simply buys a plan (a nudge is shown, nothing is deducted).

### 3.5 Admin benefits & promo
- Available **admin-granted discounts / promo codes** with terms + expiry (consumed at checkout, **user-chosen, never auto-applied**).
- **Revocation:** admin may revoke an **unused** benefit → it disappears here (already-consumed grants are honoured).
- **All balances are entitlements** — no monetary value, no refund, simply **lapse on expiry**.

### 3.6 Empty states
- No active plans / no free slots / no boost-days / no trial / no benefits → each shows a clear, friendly state with the relevant CTA (post a listing / buy a plan).

---

## 4. Tab 2 — Payment History (orders & invoices)

### 4.1 Lifetime order list
- **Every order:** Order ID · context (listing slot / boost / relist) · plan · **amount** (or "Complimentary" ₹0) · **status** (Success · Free · Failed · Pending · Verifying · Reversed) · date.
- **Retained forever** — an order stays even if the listing it fulfilled is later deleted (shown as "listing no longer available"); never silently dropped.

### 4.2 Filters, search & status legend
- **Filter:** status · context · date range. **Search:** Order ID · listing.
- **Status legend** — a short glossary of what each status means (esp. Verifying / Reversed).
- Pagination / infinite scroll for long histories.

### 4.3 Order detail (tap an order)
- Full breakdown: line item · plan / benefit applied · **base · discount · GST (CGST/SGST/IGST) · total** · payment **method type** (UPI / card / etc. — no card data) · gateway **UTR / RRN** · fulfilment status · issue status · **timeline** (created → paid → fulfilled → invoiced / reversed).

### 4.4 Per-order actions
- **View / download GST invoice** · **retry** a Failed payment (same order, no duplicate) · **report a payment issue** (→ a Payment-category ticket in Report / Help) · **view fulfilment** (open listing / boost / relist) · **track reversal**.

### 4.5 Reversal tracking (not a refund)
- **Deducted-but-failed** → "**reversal pending** (bank-timed, 2–5 days)" → **Reversed**. Clearly labelled **not a refund** (no purchase happened).
- **Overdue** (past the window) → prompt to **report a payment issue** for follow-up.

### 4.6 Invoices
- **GST-compliant invoice** on every paid success + **₹0 complimentary receipts** (free / trial); full **archive**; **download PDF**; **reissue / correction** (add a missed GSTIN / fix details → corrected invoice / credit note — **tax document only, no money movement**); **resend**; **bulk export** (date range) for business accounting.

### 4.7 Billing details
- Saved billing info (**Individual / Business** · **GSTIN** (format-validated) · address · **place of supply**) for invoices; edit; **save-for-next-time** (for input-tax-credit invoices).

---

## 5. Notifications Integration
- **Plan / slot / boost-day expiring · invoice sent · reversal completed / overdue · admin granted a benefit · payment-issue status** → in-app + browser (+ transactional email, main set); each **deep-links** here.

---

## 6. Privacy & Security
- **Auth-scoped** — own orders / plans / invoices only.
- Invoices carry PII / GSTIN → stored securely; **no card data stored** (PCI via the gateway).

---

## 7. Accessibility, Language & Roles
- Labelled controls, keyboard operable, visible focus, adequate tap targets; status never signalled by colour alone (icon + text on statuses / chips).
- Language **EN / GU / HI**; amounts in **INR** (Lakh / Cr where sensible); GST; India.
- Buyer / Broker → property plans; Developer / Builder → project plans; **all** can hold boost entitlements. A **pure buyer** (no listings) may have empty plans but still sees orders / benefits.

---

## 8. Data & States
- **Screen states:** loading · loaded · empty (per section) · offline · error.
- **PWA:** cached plans / history / invoices viewable **offline** ("offline — last updated …").
- **Per record:** plan {listing ref · plan · inclusions · days-left · expiry}; benefit {type · granted/used/remaining · expiry · status}; order {Order ID · context · amount/₹0 · status · issue-status · invoice ref · method · UTR/RRN · timeline · timestamps}.

---

## 9. Rules & Edge Cases
- **Not a wallet / credit / refund;** balances = entitlements, lapse on expiry, no cash value.
- **No auto-renew / auto-charge / stored mandate** — renewals are always deliberate.
- **Single-item checkout** → no bulk renew / no mixed cart.
- **Reversal ≠ refund** (a failed debit returns; a completed purchase is never refunded).
- **Orders retained** even if the fulfilled listing is deleted.
- **Not a gate;** verification-independent.

---

## 10. Excluded from this Screen
- **Checkout / pay flow** (payment screen).
- **Boost activation & live status** (boost screen).
- **Admin grant / revoke & reconciliation** (admin subdomain).
- **Support-ticket thread** (Report / Help — this screen only launches the issue).
- **No wallet · no refund · no card storage · no maps.**

---

## 11. Cross-screen Consistency
- **Recent orders** ↔ payment §17 (this = the **lifetime** hub).
- **Plan / slot → posting** ↔ create-listing (payment-first slot).
- **Boost-days / reusable** ↔ boost §5 / §8; **running boosts** live on the Boost screen.
- **Renew / relist** ↔ leads §4.2 → payment.
- **Report payment issue** ↔ Report / Help (Payment ticket).
- **Benefits / grants / revocation** ↔ admin + payment §4.
- **Invoices / GST** ↔ payment §7 / §15.
- **INR / GST / PWA / EN-GU-HI / no-maps / no-wallet** ↔ product-wide.

---

## 12. Referenced Screens (defined elsewhere)
- **payment / checkout** · **create-listing** · **boost** (+ reuse) · **leads** (relist / renew) · **Report / Help** (payment ticket) · **admin** (grants, reconciliation) · **Edit Profile** (notification prefs) · **notification engine**.

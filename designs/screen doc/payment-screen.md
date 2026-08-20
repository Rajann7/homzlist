# Payment (Checkout) — Specification

> The single, unified **checkout** screen for every paid action in Homzlist. It is reached from three contexts — **(1) a new listing slot** (plan wall, before the create form opens), **(2) a Boost** (day-wise plan on one own live listing), **(3) a Relist / Renew** (a Sold / Expired listing). This screen owns the **full flow A-to-Z**: showing the applicable **plans** (including any **trial**), showing any **admin-granted free listing / free boost / discount**, selecting one, the **order summary**, tax + invoice, taking payment, confirming fulfilment, and **handling every payment problem** (deducted-but-failed, disputes, reporting, invoice fixes). All purchases are **payment-first**. A **successful** purchase is **never refunded**; a **failed** payment where money was debited is **auto-reversed by the bank** (not a refund — §12–14). **No referral / credit / wallet system exists** — the only non-paid access comes from **admin-granted benefits** (§4). Login required; own-account purchases only. India-only, INR.

---

## 1. Purpose & Scope
- One checkout that serves **all** paid flows so plans, pricing, tax, invoice, fulfilment, and issue-handling never diverge between contexts.
- **In scope (A-to-Z):** plan display & selection (incl. trial) · **admin-granted free / trial / discount benefits** · order summary · price + GST breakdown · admin promo code · billing (GST) · payment methods · pay + processing · all result states (incl. ₹0 free orders & deducted-but-pending) · fulfilment · **payment reporting / issues / disputes** · receipt / invoice (incl. ₹0 complimentary + reissue) · recent-orders access · notifications · security & compliance.
- **Payment-first** — restated & enforced (create-listing §2, boost §5). **No refund on a completed purchase**; **auto-reversal** of a *failed* debit is a separate, non-refund event (§12–14).
- **No referral, no stored credit, no wallet.** Free/discounted access is **only** via admin grants (§4).
- Only the **line item + fulfilment** change per context; **plan display, benefits, payment mechanics, and issue-handling are identical** across all three.

---

## 2. Entry Contexts (what is being bought)
| Context | Trigger (from) | Plans / benefits shown | Line item | On success → |
|---|---|---|---|---|
| **Listing slot** | Plan wall, on picking a listing type (create-listing §2) | Role-wise plans + any **admin free listing / trial** | Plan → **1 slot** (or bundle) + **live-days** | Route into the **create form**; draft **holds the slot** |
| **Boost** | Boost screen, for one **own LIVE** listing (boost §3–5) | **Day-wise** plans + any **admin free boost** | Boost plan for the selected listing | **Auto-activate** boost, **no admin approval** (boost §6) |
| **Relist / Renew** | Leads → three-dot on a **Sold / Expired** listing (leads §4.2) | Role-wise plans + applicable admin benefit | New plan for that listing | Republish → **re-approval** (Pending); new window starts |

- **Role-wise plans:** Buyer / Broker buy **property** plans; Developer / Builder buy **project** plans. Boost is for all three roles (own listing only).
- **Single-item checkout** — one purchase per session; **no mixed cart**.

---

## 3. Plan Display & Selection  *(shown on this screen)*
- On entry, the screen **renders the applicable plans for the context + role**; the user picks here and it flows into the order summary (§5).
- **Plan card:** name · **price (₹)** · what it grants (**listing:** slots + **live-days**; **boost:** **N days**, day-wise) · feature list · **per-day cost** (boost) · **"Recommended"** tag · **savings vs shorter plan**.
- **Trial plan (if offered)** appears here as its own option — e.g. a **free / time-limited trial** for the context. Trial rules in §4.
- For **boost**, the note **placement is identical across all plans — only duration differs** (boost §2).
- **Current / active plan** indicated on renew / upgrade; upgrade / downgrade paths where they apply.
- **Bundles / multi-slot** (listing plans only); boost & relist are always one listing.
- If the user holds an **admin-granted free benefit** for this context, it is surfaced **alongside** the paid plans as a "**use free**" alternative (§4) — never auto-consumed.
- **Empty / unavailable** → a clear message, never a blank screen. Selecting a plan **locks a server quote** for the session (§6, §21).

---

## 4. Admin-Granted Benefits & Trials  *(A-to-Z, shown on this screen)*
> The **only** way to get free or discounted access. Granted from the **admin side** (referenced, not specced here); this screen **displays, applies, and records** them. **There is no referral / credit / wallet system.**

- **Benefit types (admin-granted):**
  - **Free listing slot(s)** — complimentary slot(s) for a role/listing-type; each grants one published listing.
  - **Free boost** — complimentary day-wise boost (N days) for one own live listing.
  - **Trial plan** — a free or time-limited trial for a context (e.g. "list 1 property free", or a duration-limited trial).
  - **Admin discount / waiver** — a % or flat reduction, or a full waiver, applied to a paid plan.
  - **Admin promo code** — an optional "**have a code?**" input; validated server-side (invalid · expired · not-applicable-to-this-plan/role/context · usage-limit reached).
- **Display (each benefit):** type · **source label ("Granted by admin" / "Trial")** · **quantity / balance remaining** · **validity / expiry** · **scope** (which role / context / listing-type it applies to). Only benefits valid for the **current context** are offered.
- **Trial specifics:** shown with its terms (what it grants, duration, any limit) and **status — Available · Active · Used · Expired**. **A trial never auto-charges and never auto-renews** (payment-first, no stored mandate) — when it ends the user simply buys a plan; nothing is deducted silently.
- **Applying a free benefit / 100%-waiver:** produces a **₹0 order** → **the payment gateway is skipped** → straight to fulfilment (§11). It still **creates an order record + a ₹0 complimentary receipt** and **consumes** the benefit (decrements balance).
- **Applying a partial discount:** reduces the payable; the remainder is paid normally through the gateway (§9); GST computed on the discounted taxable value (§6).
- **Choice, not silent use:** if the user could pay **or** use a free benefit, both are shown and the user **chooses**; a free benefit is never auto-spent.
- **Balance & consumption:** remaining free slots / boost-days shown; decremented on use; **expire per the grant** (unused → simply lapse; **no monetary value, no refund**).
- **Revocation:** admin may revoke an **unused** benefit (it disappears here); an **already-consumed** benefit stands (the listing / boost it created is honoured).
- **Empty state:** no admin benefit for this context → normal paid flow only.

---

## 5. Order Summary Block
- **Context-aware item card:**
  - *Listing slot:* plan (or free/trial) · listing type (e.g. "Residential Flat — Sell") · slot count · **live-duration** · role.
  - *Boost:* listing preview (**thumbnail · title · reference ID**) · day-wise plan (or free boost, **N days**).
  - *Relist / Renew:* the listing (**thumbnail · title · reference ID**, prior Sold / Expired) · new plan.
- **Applied benefit banner** — when a free / trial / discount is in use, it is shown here with its source and effect.
- **"Change plan / benefit"** → back to §3–4 before paying. **Quantity** (listing slots only); boost & relist fixed at 1.

---

## 6. Price Breakdown Block
- **INR (₹) only.** Plan fees in plain ₹.
- Lines: **Base price** → **Discount / promo / admin waiver** (if any, negative) → **Taxable value** → **GST** (**CGST + SGST** intra-state / **IGST** inter-state, with **rate + amount + SAC code**) → **Round-off** → **Total payable** (bold; the pay button repeats it).
- **Free benefit / 100% waiver → Total = ₹0** → the gateway is skipped (§9), a ₹0 record + receipt is still issued (§15).
- **Price locked at entry** via the server quote (quote expiry, §21). **Amount always server-verified** — the client total is display-only (§18).
- **No referral / credit line exists** — the only reduction lines are an **admin discount / promo / waiver**.

---

## 7. Billing Details (for the GST invoice)
- **Auto-filled** from profile (name · login number · city); editable for this invoice; **save-for-next-time**.
- **Individual vs Business** toggle. **GSTIN (optional)** for Broker / Developer-Builder → **format-validated**, for an **input-tax-credit** invoice.
- **Billing address** (optional; from profile). Email (optional) for the invoice copy.

---

## 8. Payment Methods
- **India-first:** **UPI** (intent / collect / QR) · **cards** (credit / debit) · **net banking** · **wallets**.
- **Saved methods** (optional) — **RBI-compliant tokenized** cards / saved UPI; a default can be set. **No raw card data on Homzlist servers.**
- **The payment gateway is the one necessary paid (per-transaction) dependency** — consistent with the near-zero-fixed-cost rule; tax calc, invoicing, discounts/promos, reconciliation, and issue-handling are all **in-house**.
- No cash / offline / COD. (For a **₹0 free order** no method is needed — §4, §9.)

---

## 9. Pay Action & Processing
- **₹0 / fully-free order** → **no gateway**; a single **"Confirm & use free"** action → order recorded → fulfilment (§11).
- **Paid order:** **Pay button** shows the exact total; **disabled** until billing is valid + a method is chosen.
- On tap → **order created (Order ID) first**, then gateway SDK / redirect; a **processing** state with a **do-not-close / do-not-refresh** warning.
- **3-D Secure / OTP / UPI-PIN** via the gateway; **fraud & velocity checks** (§18).
- **Idempotency key** per attempt → **no double charge** on double-tap / retry / back-button; a retry reuses the **same order**.
- **Return / deep-link handling** after redirect or UPI app-switch; a **network drop** resolves via status poll, not a re-charge.

---

## 10. Result States
- **Success (paid)** — what was unlocked (§11) · **Order ID** · **invoice** · context CTA (open create form / view boosted listing / view relisted listing).
- **Success (free / ₹0)** — benefit consumed · **₹0 complimentary receipt** · same fulfilment CTA.
- **Trial activated** — trial marked **Active**, terms shown, fulfilment proceeds.
- **Failure** — reason (declined · insufficient · timeout · cancelled) · **nothing charged, nothing applied** · **Retry / change method** · **Report issue** (§14).
- **Pending / processing (async UPI)** — "confirming with your bank"; waits on the **webhook**, does **not** re-charge.
- **Deducted-but-not-confirmed** *(key India case, §12)* — a "**verifying your payment**" state with guidance + timer; not a failure, not a double-charge prompt.
- **Abandoned / closed** — nothing charged, nothing unlocked; restart from §3. Listing slot: **no draft/slot exists until success**.
- **Quote / session expired** — re-fetch price before paying (§21).

---

## 11. Fulfilment (server-confirmed unlock)
- **Source of truth = the gateway webhook / server confirmation** (paid) or the **recorded ₹0 order** (free) — never the client screen → prevents *unlock-without-payment* and *payment-without-unlock*.
- **Paid and free fulfil identically downstream:**
  - **Listing slot** → route into create form; **draft holds the slot** (create-listing §2); the listing still goes to **admin approval** like any other.
  - **Boost** → **auto-activate** on the live listing, **no admin approval**; **Boosted tag** immediate (boost §6).
  - **Relist / Renew** → republish → **re-approval** (Pending); new window starts.
- **Client-success but webhook-not-yet** → the unlock **waits** (pending), resolves via reconciliation (§16); no false unlock.

---

## 12. Deducted-but-Failed → Auto-Reversal  *(NOT a refund)*
- **What it is:** the bank debited money but the transaction **did not complete** — **no purchase happened**.
- **Handling:** a clear "**payment being verified — if it failed, your bank auto-reverses the amount, usually in 2–5 business days**" message, with the **bank reference (UTR / RRN)** where available.
- **Separate from the no-refund rule (§13):** a failed debit returning is **not** refunding a completed purchase.
- **Reconciliation** (§16) matches the gateway's final status → succeeded = **unlock**; failed = **left for bank auto-reversal**, order stays **Failed**, nothing granted.
- Not reversed within the window → the user **reports it** (§14) with the UTR/RRN; support pursues it with the gateway/bank.

---

## 13. No-Refund Policy (completed purchases)
- **A successful, completed purchase is never refunded** — incl. admin rejection, user sold / hidden / deleted, boost paused, or a listing going non-live. Payment-first, non-reversible.
- **Shown clearly before payment** with an inline **acknowledgement**.
- **Boost admin-reject exception is not a refund:** admin rejecting / removing a boosted listing → **no money back**, but the boost is **reusable (remaining days)** on the **Boost screen** (boost §8).
- **Free / trial benefits carry no monetary value** — unused → they lapse per grant terms; there is nothing to refund.
- **Contrast (§12):** *no refund* = a completed order won't be reversed; *auto-reversal* = a failed debit (no order) comes back from the bank.

---

## 14. Payment Issues, Reporting & Disputes  *(shown on this screen)*
- **Entry points:** a **"Report a payment issue"** action on any Failed / Pending / recent order (§17), and from the failure / pending result states.
- **Issue categories:**
  - **Money debited but order not unlocked** (deducted-but-failed, §12) → verify → unlock if it actually succeeded, else bank auto-reversal.
  - **Charged but fulfilment missing** — a *successful* order where **boost didn't activate / slot not granted / relist didn't republish** → support **completes the fulfilment** (not a refund; the purchase stands).
  - **Double charge / duplicate** — reconciliation detects it; the uncaptured duplicate goes to bank auto-reversal.
  - **Wrong amount charged** — verified vs the server quote; fixed via auto-reversal / fulfilment, not a refund of a valid order.
  - **Invoice problem** — wrong / missing GSTIN or details → **invoice reissue / correction** (§15), no money movement.
  - **Free-benefit not applied / wrongly consumed** — verified against the grant + audit trail; the benefit is **restored** or the fulfilment completed.
- **Report form:** pre-filled **Order ID + invoice ref**, category, description, **evidence** (bank **UTR / RRN**, screenshot).
- **Ticket lifecycle:** **Open → Under review → Resolved / Closed** (with reason); status visible on the order; notified per channel.
- **SLA:** an expected-resolution window is shown; auto-reversal cases also show the bank's 2–5 day window.
- **Resolution types (explicit):** **complete the fulfilment** · **confirm bank auto-reversal** · **restore a free benefit** · **reissue / correct an invoice** — **never a cash refund of a completed purchase.**
- **Chargebacks (bank-initiated):** the related order / fulfilment is **suspended pending resolution**; outcome is bank-decided and reconciled here.
- **Support channels:** in-app ticket (primary) + email + WhatsApp, tied to the Order ID.

---

## 15. Receipt / Invoice
- **GST-compliant tax invoice** on every paid success: seller GSTIN · buyer GSTIN (if given) · unique **invoice-number series** · date · plan description · **SAC code** · taxable value · **CGST / SGST / IGST** · total.
- **₹0 free / trial order** → a **complimentary ₹0 receipt / record** (marked complimentary) for audit and history.
- **Reissue / correction** — add a missed GSTIN or fix details → **corrected invoice / tax credit note** (tax-document only, **not** a monetary refund).
- **Delivery:** in-app PDF + email + WhatsApp (per notification prefs); **resend** available. Stored under orders (§17) and the Billing / Payment-history screen.

---

## 16. Reconciliation & Audit (integrity)
- A background job **matches gateway status ↔ Homzlist orders**: *paid-but-not-unlocked* → **auto-completes fulfilment**; *debited-but-failed* → **Failed**, left for **bank auto-reversal** (§12); *duplicate / uncaptured* → flagged & reversed.
- Every state change (paid, free-consumed, revoked, reversed, issue-resolved) is written to an **audit trail** (order · amount · benefit ref · gateway UTR/RRN · timestamp · actor) — the basis for resolving any reported issue (§14).

---

## 17. Recent Orders / Transactions  *(access needed to report)*
- A **recent-orders list**: **status** (Success / Free / Failed / Pending / Verifying / Reversed) · amount (or "Complimentary") · context · date · Order ID.
- **Per-order actions:** **view / download invoice** · **retry** a Failed payment (same order, no duplicate) · **report a payment issue** (§14) · view fulfilment (open listing / boost / relist).
- The **lifetime history** is the separate Billing / Payment-history screen; this screen surfaces the **recent set + all order actions** so reporting is self-contained.

---

## 18. Security, Fraud & Compliance
- **PCI-DSS handled by the gateway**; card fields gateway-hosted; **no raw card data stored**; **RBI tokenization** for saved cards.
- **3-D Secure / OTP / UPI-PIN** on every eligible transaction.
- **Server-side amount + order + benefit verification** on every callback; **webhook signature verification**; the client amount is never trusted.
- **Idempotency** (no double charge) + **velocity / fraud checks** (rapid-retry, mismatched-amount, benefit-abuse, anomalous attempts rejected).
- **GST-compliant** invoice numbering & tax computation. Admin billing / grant controls run on the **isolated admin subdomain** (account.homzlist.com).

---

## 19. Notifications
- Payment **success / free-applied / failure / verifying / reversed** · **fulfilment done** (slot ready / boost active / relisted) · **invoice sent** · **issue-status change** · **admin granted you a free listing / boost / trial** (surfaced here when the user next checks out).
- Channels — **in-app · email · WhatsApp** (Edit-Profile §5.3). Plan/boost/trial **expiry** reminders are owned by their own screens.

---

## 20. Data & States (consolidated)
- **Flow states:** selecting-plan · benefit-available · quote-ready · applying-promo · billing-invalid · processing · **success (paid)** · **success (free / ₹0)** · **trial-active** · **failure** · **pending** · **verifying (deducted)** · **reversed** · **quote/session-expired**.
- **Issue states:** none · reported (Open) · Under review · Resolved · Closed.
- **Gates:** login required; **owner-only**. **No verification gate** — a Developer / Builder can buy a plan and list **whether verified or not**; verification is an **optional trust badge only** (Edit-Profile), never a purchase / listing gate.
- Every order carries: Order ID · context · listing/plan/benefit ref · base · discount · tax · total (or ₹0) · gateway UTR/RRN · status · issue-status · invoice ref · timestamps.

---

## 21. Rules & Edge Cases
- **Quote / session expiry** (~15 min) → re-fetch price before charging; a stale quote can't be charged.
- **Double-charge prevention** via idempotency; **back-button safe**; **retry reuses the same order**.
- **Free benefit rules:** applied only to a **matching context / role / listing-type**; never auto-spent; unused → lapse (no value, no refund); admin may revoke while **unused**; already-consumed grants are honoured.
- **Trial rules:** **never auto-charges / auto-renews**; on end the user buys normally; one trial per grant.
- **Target ineligible mid-flow** — *Boost:* listing no longer Live → block. *Relist:* state changed → re-validate before charging / consuming a benefit.
- **Verification is NOT required** to buy or list (builder verified or unverified both proceed); the badge is trust-only.
- **No mixed cart**; **single-item checkout**. **Failed-debit auto-reversal is bank-timed** (2–5 days), not an instant in-app refund.
- **Language:** checkout copy, the no-refund consent, benefit terms, and issue flows follow the app's UI language (EN / GU / HI).

---

## 22. Excluded from this Screen
- **Refunds** — none for completed purchases (auto-reversal of a *failed* debit is a bank event, not an in-app refund).
- **Referral / credit / stored-value / wallet system** — **does not exist** in the product; free/discounted access is **only** admin-granted (§4).
- **Admin grant / revoke UI, billing & reconciliation dashboard, chargeback adjudication** (admin side; this screen only displays outcomes).
- **create-listing form**, **Boost management** UI, **Boost reuse** (boost §8) — fulfilment routes to them.
- **Plan / boost / trial expiry reminders** (owned by their screens).
- **Any verification gate** — verification is optional and lives on Edit Profile.
- No maps · no EMI / loan widget · no view counts.

---

## 23. Cross-screen Consistency
- **Payment-first + no refund on completed purchases** → create-listing §2, boost §5.
- **Listing slot** (paid or free) → draft **holds the slot** → admin approval (create-listing §2).
- **Boost** → **auto-activates, no admin approval**, tag immediate (boost §6); **no-refund / reuse** hand-off (boost §8).
- **Relist / Renew** → **new plan → re-approval** (leads §4.2).
- **Verification** → **optional trust badge only, never a purchase/listing gate** (Edit-Profile §3) — builder verified or unverified both list & buy.
- **Admin-granted free listings / boosts / trials / discounts** → shown & consumed here; granted / revoked on the admin side.
- **Notifications** → in-app / email / WhatsApp (Edit-Profile §5.3).
- **India** → INR · GST invoice · one gateway as the sole paid per-transaction dependency · "Made in India".

---

## 24. Referenced Screens (defined elsewhere)
- **admin** (grants & revokes free listings / boosts / trials / discounts; billing; reconciliation; chargebacks; moderation) · **create-listing** form · **Boost** screen (+ reuse) · **Leads / Inquiry** (relist / renew trigger) · **listing view** screen · **Billing / Payment-history** screen (lifetime) · **Edit Profile** (optional verification, notification prefs).

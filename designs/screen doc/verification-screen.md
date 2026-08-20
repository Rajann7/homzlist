# Verification (Broker & Developer/Builder) — Specification

> The dedicated screen where a **Broker** or **Developer/Builder** applies for and manages their **trust verification**. Because document availability varies (many Indian brokers aren't RERA-registered; some have only basic ID), verification is **TIERED** — a user earns the **level their documents support**, never nothing (once identity is proven) and never over-claimed. **Buyers have no verification.** Verification is a **TRUST SIGNAL ONLY** — never a gate to buy, list, or use any feature (payment spec). **Documents are private** (admin-only, never public); only the earned **level / badge** is public. Admin review on the isolated admin subdomain. No maps · PWA · EN / GU / HI · "Made in India".

---

## 1. Purpose & Scope
- Broker & Developer/Builder **apply for + manage tiered verification** here.
- **In scope:** verification levels/tiers, status, per-document application + review, states, upgrade path, badge propagation, notifications, privacy, states.
- **Out of scope:** buyers; the admin **review/decision** (admin subdomain); the **badge display** surfaces (defined there).
- **Not a gate** — buying/listing works at any level (even unverified).

---

## 2. Verification Levels (core — solves varying document availability)
Verification is **graded, not binary.** The badge reflects the **highest level the user's verified documents support**; a user with fewer documents still earns a **real lower level** (never "nothing" once identity is proven), and the badge **never claims more than what was checked.**

### 2.1 Baseline — Phone Verified (automatic)
- Every account is phone/OTP verified at signup. **Baseline only — no public badge**; the floor, not a trust tier.

### 2.2 Broker levels
- **Level 1 — ID Verified** (minimum badge): **PAN + Aadhaar / govt photo ID + photo** approved (identity confirmed, name matches profile). Badge: **"ID Verified"**.
- **Level 2 — RERA Verified** (top badge): Level 1 **+ a valid RERA agent registration** (number + certificate, cross-checked on the state RERA portal). Badge: **"RERA Verified Agent"**.
- **Agency add-on:** a firm/agency may also submit business registration / GST → a "Registered Agency" signal alongside the level.

### 2.3 Developer / Builder levels
- **Level 1 — Business Verified** (minimum badge): **company PAN + company registration proof + authorized-signatory KYC (+ GST)** approved. Badge: **"Business Verified"**.
- **Level 2 — RERA Verified** (top badge): Level 1 **+ a valid RERA promoter registration**. Badge: **"RERA Verified Builder"**.

### 2.4 The rule — which documents verify what
- **Minimum for ANY badge = identity / business KYC** (broker: PAN + Aadhaar; builder: company PAN + registration + signatory KYC). Without this, the account stays **Phone-only (no badge)**.
- **RERA registration = the top tier** — the single strongest real-estate trust signal in India; it lifts a Level-1 user to "RERA Verified".
- A user submits **whatever they have**; the level is **computed from the documents that pass** — fewer docs → a real lower level, more docs → a higher level.

---

## 3. Status Header (always shown)
- Current **level** + badge preview + a **"what's verified" breakdown** (e.g. ✓ ID · ✓ RERA · — GST) so trust is transparent and never over-stated.
- **Upgrade CTA** — an ID/Business-Verified user sees **"Upgrade to RERA Verified"** (add the RERA number/certificate).
- States surfaced: Phone-only · Level 1 · RERA Verified · Pending · Rejected · Revoked · Expired.
- Short "what verification gives" (trust, higher buyer response).

---

## 4. Application Form (role-based; submit what you have)

### 4.1 Broker
- Business/broker details (pre-fill from profile): name · cities · experience.
- **RERA agent registration number** — lifts to the top tier (optional; many brokers aren't registered).
- **Documents (India-standard; submit what applies):**
  - **Identity (minimum for a badge):** PAN card · Aadhaar / govt photo ID · passport-size photo.
  - **Address:** business / office address proof (electricity bill / rent agreement).
  - **RERA (for the top tier):** RERA agent registration certificate.
  - **If a firm / agency:** business registration proof (partnership deed / incorporation) + company PAN / GST.

### 4.2 Developer / Builder
- Company details (pre-fill from profile): company name · office address · year established.
- **RERA promoter registration number** — lifts to the top tier.
- **Documents (India-standard):**
  - **Business identity (minimum for a badge):** company PAN · company registration proof (Certificate of Incorporation / partnership deed / MOA & AOA) · authorized-signatory KYC (PAN + Aadhaar of director/partner).
  - **GST:** GST registration certificate.
  - **Address:** company / office address proof.
  - **RERA (for the top tier):** RERA promoter registration certificate.
  - **Brand:** company logo.
  - *(Per-project RERA / title / sanction-plan docs stay at the listing level, not here.)*

### 4.3 Document upload (common)
- Multiple documents, each labelled; common image formats + PDF; preview; replace/remove; reasonable size.
- **Name-match check** — the name on ID/PAN should match the profile; mismatches are flagged in review.

### 4.4 Declaration & submit
- **"I declare the information & documents are accurate"** consent.
- Submit → **Pending** → admin review (`admin.verification.requested`).

---

## 5. Review, States & Lifecycle (per-document → computed level)
- **Per-document status:** each submitted document is **Pending / Verified / Rejected** (with a reason) individually.
- **Computed level:** the badge level is derived from the **documents that pass** — identity docs → Level 1; RERA → Level 2. A partial pass still yields the level it supports.
- **Application states:** Not applied · Pending · Verified (Level 1 / RERA) · **Partially verified** (some docs rejected → a lower level granted) · Rejected (no level reached) · Revoked · Expired.
- **Upgrade any time** — add RERA (or a missing doc) to move up; incremental, no need to redo verified docs.
- **Withdraw** while Pending.
- **Rejected document → re-upload that specific document** (sensible cooldown/cap); other verified docs stand.
- **Revoked (admin)** → level removed; reason; re-apply.
- **Expired** (e.g. RERA's 5-year validity) → that tier drops (may fall back to Level 1); renew prompt.
- **Re-submit / review history** retained (audit).

---

## 6. Badge Propagation (consistency)
- The **earned level's badge** shows on **public profile · listing cards · view-screen poster block · leads inquirer profile** — with the correct label ("ID Verified" / "Business Verified" / "RERA Verified").
- **Phone-only** → no badge ("Unverified" state).
- **Revoked / expired-to-lower** → the badge updates/removes on **ALL surfaces immediately**.
- The tooltip/label states **exactly what's verified** — never over-claims.

---

## 7. Editing a Verified Profile
- Editing a verification-critical field (e.g., a business name that must match the documents) flags the relevant level for **admin re-review** (consistent with Edit Profile §7); the badge shows "under re-review" until confirmed.

---

## 8. Notifications
- `verification.submitted` · `verification.doc_verified` / `doc_rejected` · `verification.level_granted` (Level 1 / RERA) · `verification.rejected` · `verification.revoked` · `verification.expiring` / `expired`.
- **Channels:** in-app + browser; **level-granted / rejected also email** (main set). Each **deep-links** here.
- `admin.verification.requested` → admin feed on submit.

---

## 9. Privacy & Security
- Documents **strictly private** — admin-only, never public; only the **level / badge** is public.
- KYC / company documents stored **securely** (encrypted), retained per policy, **auth-scoped**.
- **Rejection reasons** visible only to the applicant.

---

## 10. Data & States
- **Screen states:** loading · phone-only · form · pending · verified(level) · partially-verified · rejected · revoked · expired · error.
- **Record:** role · fields · per-document {type, status, reason} · **computed level** · verified/expiry dates · history · timestamps.

---

## 11. Rules & Edge Cases
- Broker & builder only; buyers excluded.
- **Tiered** — level = the documents that pass; fewer docs → a real lower level, never nothing (once identity passes) and never over-claimed.
- **Minimum bar for any badge = identity/business KYC**; below that stays Phone-only.
- **RERA = top tier**, validated against the **public state RERA portal** (manual/admin — near-zero-cost, no paid API).
- Verification is **trust-only — NEVER blocks buying/listing**.
- One active application; **per-document re-upload on rejection** (cooldown/cap); withdraw while Pending.
- Critical-field edit on a verified account → re-review.
- Documents private; only the level public.
- **Name-match** across ID / PAN / profile enforced in review.
- Language EN / GU / HI; India (RERA / GSTIN); **near-zero-cost** manual review.

---

## 12. Excluded from this Screen
- **Buyers.**
- **Admin review/decision UI** (admin subdomain).
- **Badge display** surfaces (defined on their screens).
- **Any purchase/listing gate.**

---

## 13. Cross-screen Consistency
- **Apply entry + fields** ↔ Edit Profile §3.
- **Level badges** ↔ public profile / view / leads / cards.
- **Not-a-gate** ↔ Payment.
- **Notifications** ↔ notification engine (level-granted/rejected email main-set; `admin.verification.requested`).
- **Critical-field re-review** ↔ Edit Profile §7.
- **Documents private** ↔ product's no-public-exposure of sensitive data.

---

## 14. Referenced Screens (defined elsewhere)
- **Edit Profile** · **public profile / listing view / leads / cards** (badge display) · **Payment** (not a gate) · **admin** (verification review, grant/revoke) · **Report / Help**.

# Edit Profile — Specification

> The logged-in user's own editable profile & account-settings screen. Fields are role-based — the same set collected during registration (login/register §8). Buyer, Broker, and Developer/Builder each edit their own field set. The public-facing view of this data is the separate **Public Profile** screen; this spec covers editing + account management only.

---

## 1. Purpose & Scope
- The user edits their own profile (role-based fields) and manages account settings.
- Role is fixed from registration; the fields shown match the role.
- Public display of this data → separate **Public Profile** screen.

---

## 2. Editable Profile Fields (role-based)

### 2.1 Buyer
- Profile image · full name (**required**) · email (optional) · city (single, **required**).

### 2.2 Broker
- Profile photo **OR** company logo (either one) · broker / business name (**required**) · experience (years) · cities (**multi, required**) · office address (optional) · about.

### 2.3 Developer / Builder
- Company / brand logo · business name (**required**) · contact person · email (optional) · company office address · city · about / description · year of establishment.

### 2.4 Common field rules
- Required fields marked; **Save disabled** until required fields are filled and valid.
- **Image upload:** all formats, no min/max size, crop + preview.
- **City:** searchable dropdown (type-to-filter); Buyer = single, Broker/Builder = multi (add / remove).
- Email optional; no email verification required.
- Save → confirmation; inline validation errors.

---

## 3. Verification (Broker & Developer/Builder only)
- **Apply for verification** → upload verification documents → admin review.
- **States:** Not verified (→ Apply) · Pending (under review) · Verified (badge granted) · Rejected (reason shown + re-apply).
- Documents required are admin-defined per role (broker vs builder).
- Buyers: no verification.
- The resulting status drives the **Verified / Unverified badge** shown on the Public Profile, listing cards, view-screen poster block, and Leads inquirer profile.

---

## 4. Number Management
- **Primary number = the login number** — changed only via the Change Number flow (§5.1).
- **Additional public numbers (Broker / Developer-Builder):** add → OTP verify → shown publicly; remove anytime.
- Buyer number privacy (public/private toggle) is handled per listing (create-listing), not here.

---

## 5. Account & Settings

### 5.1 Change number
- Verify old number (OTP) + verify new number (OTP) → number updated. (per auth spec)

### 5.2 Logout
- Manual **Logout** button.

### 5.3 Notification preferences
- Toggle lead / inquiry alerts: **in-app · email · WhatsApp**.

### 5.4 Delete account
- Confirmation required; consequences shown — the user's **listings and leads are removed**.

### 5.5 Terms & Privacy
- Already accepted at registration → shown as **Accepted** (links to view Terms & Privacy).

---

## 6. Field Visibility (public / hidden)
- Core fields are always public (name / business name, logo/photo, about, cities).
- Optional fields (e.g., office address) can be toggled **public or hidden** on the Public Profile.

---

## 7. Edit → Re-approval
- Ordinary profile edits (photo, about, experience) save immediately and do **not** affect listings.
- Editing a **verification-critical field** (e.g., business name) on a **Verified** account may flag the account for admin re-review.
- (Listing edits triggering re-approval are handled on create-listing — separate.)

---

## 8. States
- Loading / saving / error.
- Verification: Not verified · Pending · Verified · Rejected.
- Inline validation errors on required / invalid fields.

---

## 9. Referenced Screens (defined elsewhere)
- Public Profile · Change Number (auth) · admin verification review · Leads / Inquiry (notification prefs) · create-listing (listing-level number privacy & re-approval).

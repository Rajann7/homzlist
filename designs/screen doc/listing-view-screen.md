# Property / Project Detail (View) Screen — Specification

> This is the single detail/view screen for both **Property** listings (Buyer/Broker) and **Project** listings (Developer/Builder). It auto-renders the listing exactly as it was created — every relevant field, dynamically, with the same A-to-Z coverage as the create-listing spec. Field catalogs are **not** repeated here; this screen renders whatever the create-listing form saved for that listing type.

---

## 1. Purpose & Scope
- Detail/view screen for **both** Property and Project listings.
- Auto-renders all create-listing fields for the listing's type, dynamically and type-appropriate (same A-to-Z as create-listing).
- Only **Live** listings are public; the owner sees own non-live listings as a preview.
- The same screen has **two render modes**: Visitor view and Owner view.

## 2. Render Modes
### 2.1 Visitor view
- Full listing + gallery + poster/contact block + actions (share / save / report) + inquiry.

### 2.2 Owner view (poster viewing their own listing)
- Same content, plus an **Edit** button to manage the listing.
- **No inquiry option** on own listing.

---

## 3. Page Header (above-the-fold)
- Cover / primary image first.
- Title (auto-generated), price (prominent), location, posted-on date.
- **Reference ID** — `PROP-XXXXX` / `PROJ-XXXXX`.
- **Badges:** RERA Verified / RERA not applicable · Featured / Boost (if active) · Verified poster.
  - No broker badge.
- **Quick-facts strip:** key facts by type (e.g. BHK · area · furnishing · floor).
- Posted-on / last-updated timestamps shown.

---

## 4. Image Gallery
- **Variable image count with no gaps** — the layout adapts so there is never an empty slot:
  - 1 image → full-width.
  - 2 images → split.
  - 3+ images → grid / carousel.
- Cover / primary image shown first.
- Lightbox / fullscreen view + swipe + thumbnails.
- **Category tabs:** Interior / Exterior / Floor plan / Amenities (from the create-listing image category tags).
- Floor-plan image(s) shown.
- Auto-watermark displayed on images.
- Zero-image fallback placeholder (safety; min is enforced at create).

---

## 5. Price Block
- Total price — displayed in **Lakh / Crore**.
- Price per sq.ft.
- Negotiable tag.
- **Price on request** → amount hidden, shows "Price on request".
- Booking / token amount.
- Monthly maintenance · other charges.
- **Brokerage info** (from create-listing: charged Y/N + %/amount, or "No Brokerage" for owner).
- **Rent listings** additionally show: monthly rent, security deposit, maintenance, available-from date, preferred tenant, lock-in.

---

## 6. Details (auto-rendered by type)
- Renders the selected type's full field set **as defined in the create-listing spec**, grouped logically: Overview · Configuration (BHK/bath/balcony) · Area (carpet/built-up/super) · Floor & Furnishing · Amenities · Possession / Ownership · Description.
- **No-gap rule (all fields):** only filled fields render; empty optional fields are hidden — no blank labels or empty rows. Same no-gap principle as the gallery, applied to every field.
- Amenities shown with icons.
- Description shown as rich text.

---

## 7. Location Block
- State · City · Locality / Sub-locality · Area / Landmark · Pin code.
- Society / Building / Project name.
- **Full address** (house / plot / building no. + street) — **shown on the listing.**
- Nearby landmarks with distance — text-based.
- **No map on this screen.**

---

## 8. Project-Specific Block (Developer / Builder)
- **Configurations table** — per config: type, carpet area, built-up, size, price range, floor-plan image, availability.
- **Status-based fields** — only the selected status's fields render (Upcoming / Pre-Launch / New Launch / Under Construction / Ready to Move).
- **Wing / tower-wise inventory** — Tower → Wing → Floor → Unit, each marked Available / Booked / Sold (collapsible display).
- Amenities · specifications · payment plan · bank approvals · approvals & clearances.
- **Brochure (PDF)** + **Price-list (PDF)** download.
- **RERA:** multiple RERA numbers supported (one per phase) · RERA Verified tag · RERA status link opens the state portal (Gujarat → GujRERA).
- Builder / developer name → profile link.
- **Project custom message** — optional, **fixed length** (character counter + hard cap).

---

## 9. Poster / Contact Block
- Poster icon + name + role.
- **Contact number shown only if Public** (otherwise hidden).
  - Public numbers are shown **directly** — no reveal-on-click.
  - If public → number + WhatsApp shown; WhatsApp click = auto-prefilled message with the listing link.
- **Multiple numbers** displayed (Broker on Property; Developer/Builder on Project).
- **Guest (not logged in):** a public number is visible, but **sending an inquiry requires login.**

---

## 10. Inquiry System

### 10.1 Who can send
- **Seeker roles only:** Buyer, Broker → can send. **Developer / Builder → cannot send.**
- Users whose own number is public **can also** send.
- **Cannot inquire on own listing** (owner sees Edit instead).
- **Login required** to send (guests are prompted to log in).

### 10.2 Inquiry form (inline popup)
- **Intent** — multi-select **(R)**: Price · Details · Availability · Photo / Brochure · Visit · More details.
- **Contact method** — multi-select **(R)**: logged-in number · custom number · WhatsApp.
  - **Custom number:** OTP-verified inline; becomes selectable after verify; **both** numbers can be selected together.
  - A verified custom number is **reusable for 30 days** on any listing without re-verifying.
  - Custom number **account ownership is not checked** — it is contact-only and may belong to anyone.
  - Verifying a custom number **does not create an account** (accounts come only from registration).
- **Contact date** — today / tomorrow / custom date **(R)**.
  - This is **when to contact the inquirer**, **not** a visit date — even if "Visit" is selected as an intent, this date is a contact-preference date only.
- **Note shown to sender:** the selected method(s) will be used to contact; contact details are shared **only** with the listing's poster.
- **"I agree" checkbox (R)** — consent for contact-sharing / terms.
- **Send.**

### 10.3 Rules & limits
- Once sent → **cannot resend or cancel.**
- **Rate limit: max 20 inquiries per user per day.**
- The sender sees their sent inquiries in the **Leads / Inquiry screen** (separate screen).

### 10.4 Poster notification on new inquiry
- The poster is notified through **all** of: in-app inquiry notification · email · **Leads / Inquiry screen** · **WhatsApp alert.**
- **WhatsApp alert** — sent from the **company's number**, "New inquiry received", containing the full details A-to-Z: what the inquiry is about (selected intents), which listing it came from, the inquirer's selected contact info, and the contact date.
- The inquiry-received alert goes **only to the poster** who owns the listing (i.e., the person who posted it).

---

## 11. Actions
- **Share** — copy link · WhatsApp · social; uses the public listing URL / slug; share preview (OG cover image).
- **Save** — add to favorites / wishlist (**login required**); appears in the Saved screen (separate).
- **Report** — reasons: spam · fraud · already sold · wrong info · duplicate · offensive → admin moderation queue.

---

## 12. Listing States on this screen
- **Live** → public (visitor view).
- **Sold / Rented** → listing is **hidden** (not public); the inquiry / send option does not appear, since the listing is no longer accessible.
- **Draft / Pending Approval** → owner preview only.
- **Paused / Expired / Withdrawn** → not public.
- **Owner viewing own listing** → Owner view with the Edit button.

---

## 13. Excluded from this screen
- No map (location shown as text / full address only).
- No EMI / loan-estimate widget.
- No broker badge.
- No number reveal-on-click.
- No view count.
- No lazy-load.
- No leads-conversion analytics.

---

## 14. Referenced screens (defined elsewhere, not in this spec)
- **Leads / Inquiry screen** — where senders see sent inquiries and posters receive & view leads.
- Saved screen · plan / payment screen · admin moderation queue · builder profile.

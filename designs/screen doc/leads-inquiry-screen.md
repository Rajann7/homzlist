# Leads / Inquiry Screen — Specification

> Central screen where a user manages the **leads received** on their own listings and reviews the **inquiries they have sent**. Buyer/Broker see both; Developer/Builder receive leads but cannot send inquiries. Profile View, Boost, create-listing (edit), and the public detail (view) screen are separate screens referenced here but defined elsewhere.

---

## 1. Purpose & Scope
- Two tabs: **My Listings** (leads received on own listings) and **Inquiries Sent** (inquiries the user sent).
- Tab names are placeholders and can be renamed.
- **Buyer & Broker:** both tabs. **Developer / Builder:** only My Listings (cannot send inquiries → Sent tab hidden/empty for them).
- Screen-level **filter + search**, scoped per tab.

---

## 2. Tabs & Role Visibility
- Default tab: **My Listings**.
- Tab badge: unread / new lead count shown on My Listings.
- Developer / Builder: **Inquiries Sent** tab hidden.

---

## 3. Filter + Search (per tab)
### 3.1 My Listings
- **Filter:** listing status (Live / Sold / Rented / Paused) · property or project type · has-leads / no-leads · boosted · date.
- **Search:** listing title · reference ID · locality.

### 3.2 Leads (within a listing)
- **Filter:** intent (price / details / availability / photo-brochure / visit / more) · contact method (call / WhatsApp) · lead status · read / unread · date.

### 3.3 Inquiries Sent
- **Filter:** listing status · date.
- **Search:** listing title.

---

## 4. My Listings Tab

### 4.1 Listing row
- Thumbnail · title · **reference ID** · status badge · price · location · **lead count (total + new/unread shown separately)** · posted / updated date · boost tag (if boosted).
- **Sorting:** newest · most leads · status.
- **Empty state:** no listings → prompt to create a listing.
- Pagination / infinite scroll for many listings.

### 4.2 Three-dot menu on a listing
- **Change status** — Live · Pause · Sold / Rented · Withdraw. (Draft / Pending Approval / Expired are system states, not user-set.)
  - Status changes trigger the create-listing lifecycle rules:
    - **Sold / Rented → listing hides from public** (per view screen); **its existing leads remain visible here** — lead history is never lost.
    - **Edit → goes for re-approval.**
    - **Pause → Live** resumed within 30 days = no re-approval; after 30 days = re-approval.
  - Confirmation dialog on **Sold / Rented** and **Withdraw**.
- **Edit property** → opens create-listing in edit mode (→ re-approval).
- **Boost property** → opens the Boost screen (separate).
- **View public listing** → opens the public detail (view) screen.
- **Share** → share the public listing link.
- **Delete listing** → confirm, then remove; **the listing and its leads are both deleted.**
- **Relist / Renew** → for Sold / Expired listings, republish; **requires a new plan purchase** (payment-first), then re-approval.

### 4.3 Listing → leads list (on tapping a listing)
- All leads for that listing shown at the top.
- **Lead row:** inquirer name · intent summary · contact-method icon(s) · date / time · **lead status** · new / unread indicator.
- **Quick actions on the row:** Call / WhatsApp (based on what the inquirer chose).
- **Three-dot on a lead:**
  - **Report** — reasons: fake · spam · abusive · wrong number → admin moderation.
  - **Status** — set lead status (see 4.5).
- Sorting / filter of leads (date · status · intent · method).
- Unread leads marked read on open.
- **Empty state:** listing with no leads yet.

### 4.4 Lead detail (on tapping a lead)
- Shows **all inquiry data exactly as the inquirer submitted it**: selected intents · **contact date (when to contact — shown prominently)** · any note.
- **Contact method — conditional:**
  - Inquirer chose **call only** → only a **Call** action shows (to the number the inquirer selected).
  - Inquirer chose **WhatsApp** → only a **WhatsApp** action shows, with a **prefilled message + listing link**.
  - **Both** chosen → both actions show.
  - The number shown is whichever the inquirer selected (logged-in / custom / both).
- **No in-app chat / reply** — the owner contacts the inquirer only via the Call / WhatsApp actions above (in-app messaging is not part of the product).
- **Inquirer profile** — shown; tapping it opens the **Profile View screen** (separate screen — to be defined).
- **Lead status** control available here as well.
- **Notes / remarks** — the owner can add notes to track the lead.
- **Repeat-inquirer indicator** — flagged if the same person inquired on the owner's other listings.

### 4.5 Lead status pipeline
- Statuses: **New · Contacted · Interested · Follow-up · Closed-Won · Lost.**
- Filterable by status; optionally auto-set to **Contacted** when the owner taps Call / WhatsApp.

---

## 5. Inquiries Sent Tab
- Each entry: listing thumbnail · title · **reference ID** · status, and **the inquiry details the user sent** (intents · chosen contact method · contact date · date sent).
- **"View Property / View Project"** label — **display-only, not clickable** (shows the listing reference from outside; the sender gets no owner actions).
- Entries are **read-only** — no resend, no cancel (consistent with the inquiry rules).
- The **sent-inquiry record persists** even if the listing is later hidden / sold / deleted — only the "View Property / View Project" becomes disabled, showing a "No longer available" state.
- **Empty state:** no inquiries sent.

---

## 6. Notifications Integration
- A new lead (in-app notification / email / WhatsApp alert from the company number) **deep-links to that specific lead** in this screen.
- Unread badges on the tab, the listing, and the lead; marked read on open.

---

## 7. Data & States
- Lead count = number of received inquiries per listing (total + new); updates in real time.
- **Sold / hidden listings keep their historical leads visible** in My Listings.
- Empty / loading / error states at all three levels (listings · leads · sent).

---

## 8. Referenced Screens (defined elsewhere)
- Profile View screen · Boost screen · create-listing (edit mode) · public detail (view) screen · admin moderation queue.

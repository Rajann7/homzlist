# Public Profile — Specification

> The public-facing profile page for a user (Broker, Developer/Builder, or Buyer), shown to anyone who views them — from a listing's poster block, from the Leads screen (inquirer profile), from a listing card, or via a shared profile link. Content and privacy adapt to the profile's role and to who is viewing. Editing is handled on the separate Edit Profile screen; this spec covers the view only.

---

## 1. Purpose, Entry Points & Viewer Types
- **Entry points:** view-screen poster block tap · Leads screen inquirer-profile tap · listing card name tap · **shared profile URL / slug**.
- **Viewer types (content & privacy differ):**
  - **Guest** — sees public info + public numbers; gated actions prompt login.
  - **Logged-in user** — full public view + contact actions.
  - **Poster viewing an inquirer** (Leads context) — see §7.
- Editing is on the separate **Edit Profile** screen (not here).

---

## 2. Universal Header (all roles)
- Avatar / logo.
- Name / business name.
- **Role label** — Buyer · Broker · Developer/Builder.
- **Verification badge** — Broker & Builder only (see §6).
- Member-since / joined date.
- Location — city / cities served.
- **Actions row:** Share profile · Report profile.

---

## 3. Broker Public Profile

### 3.1 Identity & trust
- Broker / business name · photo **or** logo · **Verified / Unverified badge** · member-since.

### 3.2 Professional details
- Experience (years) · cities served (multi — all shown) · about · office address (if provided).

### 3.3 Contact
- **Public number(s) + WhatsApp** — broker is always public; multi-number supported; WhatsApp opens a prefilled message with a profile / listing link.

### 3.4 Listings portfolio
- Grid of the broker's **live** listings + **active count**. Each card → the public detail (view) screen.
- **Only live listings** shown — Sold / hidden are excluded (consistent with the view screen).
- **Empty state:** "No active listings".

---

## 4. Developer / Builder Public Profile

### 4.1 Identity & trust
- Company / brand name · logo · **Verified / Unverified badge** · **year of establishment** · member-since.

### 4.2 Company details
- About / description · cities · office address.

### 4.3 Contact
- **Public number(s) + WhatsApp** — always public; multi-number supported.

### 4.4 Projects portfolio
- Grid of the builder's **live** projects + **active count**. Each card → the project view (with its RERA tag, configurations, and inventory).
- **Only live projects** shown — Sold / hidden excluded.
- **Empty state:** "No active projects".

---

## 5. Buyer Public Profile (minimal)
- Name · photo · city · role (Buyer) · joined date.
- **No listings** (buyers do not post).
- Primarily surfaced as **inquirer context** in the Leads screen (§7); the standalone page is intentionally minimal.

---

## 6. Verification Badge (Broker & Builder)
- **Verified** → coloured "Verified" badge + tooltip (what was verified).
- **Not verified** → "Unverified" state (grey tag / no badge).
- **Buyers** → no verification badge.
- Shown **consistently everywhere the user appears:** public profile · listing cards · view-screen poster block · Leads inquirer profile.
- The verification process itself (document upload → admin review → Verified / Rejected) lives on the **Edit Profile** screen + admin — not here. This screen only **displays** the resulting status.

---

## 7. Inquirer-Context View (from the Leads screen)
- When a poster taps an inquirer's profile, the **role-appropriate public profile** opens.
- The inquirer's **shared contact** (the Call / WhatsApp / number they chose in the inquiry) is shown in the **lead detail** — the profile itself shows general public info only.
- **Privacy:** only what the inquirer chose to share is exposed; nothing beyond their public profile.

---

## 8. Ratings & Reviews (trust layer)
- Star rating + review count on **Broker & Builder** profiles.
- Reviews come only from users who have **actually interacted** (e.g., sent an inquiry / became a lead) — prevents drive-by fake reviews.
- **Moderation:** reviews are screened for spam / fake before showing; each review can be **reported**.
- Buyers: no ratings.

---

## 9. Actions
- **Contact** — Call / WhatsApp (only if public).
- **Share profile** — public URL / slug + share preview.
- **Report profile** — reasons: fake · impersonation · spam · wrong info → admin moderation.
- **[Broker / Builder]** View all listings / projects.

---

## 10. States
- Verified / Unverified.
- No listings / projects → empty state.
- **Suspended** user → "Profile unavailable".
- **Banned** user → profile removed / unavailable.
- Loading / error states.

---

## 11. Contact & Privacy Rules (consistency with the app)
- Broker & Builder numbers **always public**; Buyer numbers per the buyer's own toggle.
- Multi-number displayed where applicable.
- Guests see public numbers; gated actions (save, inquiry) prompt login.

---

## 12. SEO / Sharing
- Public profile **URL / slug** — a shareable own page (like a microsite).
- Meta title + OG image (avatar / logo) for link previews.

---

## 13. Referenced Screens (defined elsewhere)
- Edit Profile screen · verification document flow (Edit Profile + admin) · public detail (view) screen · project view · Leads screen · admin moderation queue.

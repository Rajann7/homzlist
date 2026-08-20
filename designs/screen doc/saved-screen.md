# Saved (Favourites / Shortlist) — Specification

> The user's personal collection of **saved listings** — both **Properties** (PROP-XXXXX) and **Projects** (PROJ-XXXXX) they hearted from a card or the detail screen. **Login required.** The *save action* (the heart) lives on the cards / view screen and is defined there; **this screen only displays and manages the collection**. Guest saves are held in session and **merge into the account on login / register** (de-duped, nothing lost). Available to **all logged-in roles**. Only **Live** listings are public, so a saved listing that goes non-live is **kept with a clear "unavailable" state** (never silently dropped — same persistence principle as sent inquiries, leads §5). No maps · INR (Lakh / Cr) · PWA · "Made in India".

---

## 1. Purpose & Scope
- Show and manage everything the user has **saved / shortlisted** — properties and projects, mixed.
- **In scope:** the saved grid; sort / filter / search within saved; per-item actions (view · unsave · share · inquire where allowed); availability & price-change tracking; guest→account merge display; cross-screen heart sync; offline/PWA behaviour; privacy; empty & error states; notifications integration.
- **Out of scope (defined elsewhere, and see §18):** the save *action* / heart on cards & the view screen; **saved *searches*** and **recently viewed** (separate features — this screen is saved *listings* only); notification preferences (Edit Profile).
- **Login-gated** — a guest tapping Saved / the heart hits the **login sheet**, then returns to the action (home §9 auth gate).

---

## 2. Access & Entry Points
- **Mobile bottom nav → "Saved"** (Home · Explore · Post(+) · Saved · Profile) and the **top-app-bar saved icon**, both with an optional **saved-count badge**.
- **Profile menu** entry.
- **Deep-link** from a notification (saved-listing **price drop** / **went live** / **sold / no-longer-available**) → opens this screen or the specific item (graceful tombstone if the item is already gone, §7).

---

## 3. Who Can Save (role visibility)
- **All logged-in roles can save:** Buyer · Broker · Developer/Builder (matrix: Save/shortlist = Login-gated, all roles ✅).
- **Guest** → login gate on save; on auth, the session saves **merge** (§4).
- **Inquire from a saved item follows the global rule:** **Buyer & Broker can inquire; Developer/Builder cannot** (no "Send contact" button — role rule). Builders save for **reference only**.
- **Own listings are not saveable here** — on their own listing the owner sees **Edit**, not Save (view §2.2); own items live in *My Listings*.

---

## 4. Guest → Account Merge
- Guest saves are stored **in the browser session** (with a sane session cap); on **login / register** they are **merged into the account and de-duplicated** — no save is lost, no duplicate created.
- After merge, the collection is **per-account and syncs across devices** (§11).
- An item that became unavailable while the user was a guest still merges in, shown with its **unavailable** state (§7).

---

## 5. Saved Item Card
- **Reuses the standard card** (home card spec — fixed skeleton, anti-gap, field shortlist) and **always renders the listing's CURRENT data** (status, price, badges), not a frozen copy:
  - *Property:* cover · Sale/Rent tag · **price** · locality+city · one primary spec (Residential: BHK+carpet · Plot: plot area · Commercial: built-up+type · PG: occupancy+gender) · optional Verified / RERA.
  - *Project:* cover · project name · builder · **status badge** · price range · locality+city · optional RERA-Verified.
- **Saved-specific additions:**
  - **Filled heart** → tap to **unsave** (optimistic, with a quick **Undo** snackbar, §10).
  - **Saved date** (relative, e.g. "2 days ago").
  - **Price-change chip** — **↓ dropped / ↑ increased** vs the price when it was saved (the snapshot is used **only** to compute this chip; §8).
  - **Availability badge** when the listing is no longer live (§7).
  - **Quick actions:** View · Share · Inquire *(Buyer/Broker only)*.
- **Type tag** (Property / Project) keeps the mixed grid scannable.
- **No "Promoted / Featured" badge** — boost is silent, and it **does not re-rank the Saved screen** (§6).

---

## 6. Organization — Sort, Filter, Search, Count
- **Count** of saved items shown.
- **Sort (user-controlled; boost never re-ranks this list):** **Recently saved (default)** · Price low→high · Price high→low · Newest listing.
- **Filter / tabs:** **All · Properties · Projects**; plus Buy / Rent, city, and **Available only** (hide unavailable). Values map to the create-listing taxonomy.
- **Search within saved:** title · reference ID · locality.
- **Last-used sort & filter persist** for the user across sessions.
- **Responsive = 3 distinct layouts:** mobile single-column wide cards + chip filters; tablet 2-col grid + filter drawer; desktop 3–4-col grid + left filter rail.
- **Pagination / infinite scroll** for large collections.

---

## 7. Availability & Lifecycle (items never silently vanish)
The saved item mirrors the live status of its listing and is **retained** through status changes, each with a clear state:

- **Live** → fully actionable (view · share · inquire if allowed).
- **Price / status changed** (e.g. Under Construction → Ready to Move) → card reflects the new value; a **price ↓/↑ chip** appears for price changes (§8).
- **Paused / Expired / Withdrawn / Under Re-review** (temporarily not public) → **"Currently unavailable"** state; **kept**, because it may go live again (a *went-live* notification then fires, §9).
- **Sold / Rented** → **"Sold / Rented — no longer available"**; inquiry & share disabled; user can remove.
- **Deleted by owner / removed by admin** → **"No longer available"** tombstone with last-known cover · title · ref ID; actions disabled; user removes it.
- **Never a blank / broken card** — every non-live item shows a labelled state (consistent with the sent-inquiry persistence pattern, leads §5).
- **Bulk "Clear unavailable"** action to tidy the list; individual remove always available.

---

## 8. Price-Change & Went-Live Tracking
- At save time, a **price + status snapshot** is stored **per item**, used **only** to compute the change indicator.
- A **background compare** against the current listing detects a **price drop / rise** and a **non-live → live** transition — **fully internal, no paid API** (near-zero-cost constraint).
- **Edge handling:**
  - **Price on request** (amount hidden) → **no price chip** (nothing to compare); a went-live change may still notify.
  - **Rent listings** → the chip compares **monthly rent**.
  - **Projects** with a **price range** → compare the range (min/max shift).
- On the card: the **price-change chip** and a **"back available"** badge.
- Drives notifications (§9): **saved-listing price drop** and **saved-listing went live**.

---

## 9. Notifications Integration
- Saved items generate alerts: **price drop · went live (back available) · sold / no longer available.**
- Delivered per the user's channels — **in-app bell · email · WhatsApp** (Edit-Profile §5.3); the bell entry **deep-links** to the item here.
- **Throttled / batched** — repeated small price wobbles are de-duped so the user is never spammed (e.g. one alert per meaningful change, batched digests where sensible).
- Alerts are informational — they never change a saved item without the user.

---

## 10. Actions
- **Unsave** (heart toggle) — **optimistic UI** with an **Undo** window (a few-second snackbar); rolls back if the server call fails.
- **Bulk select → remove**; **Clear unavailable**.
- **Share** — WhatsApp + copy public link (listing slug); disabled for unavailable items.
- **Inquire / Contact** — inline, **Buyer/Broker only**, **Live** items only (opens the inquiry flow on the view screen); hidden for Builder.
- **View** → opens the public detail (view) screen.
- **Removing from Saved never affects the listing** itself.

---

## 11. State Sync & Cross-Screen Consistency
- The saved state is a **single source of truth**: unsaving here **updates the heart everywhere** (home feed, search results, view screen) and vice-versa — no stale hearts.
- **Per-account, multi-device sync**; concurrent edits resolve **last-write-wins**.
- A card's status / price / badges always reflect the **current listing**, fetched fresh; only the **price-change chip** uses the saved snapshot.

---

## 12. Offline / PWA Behaviour
- As a PWA, the **last-loaded saved list is viewable offline** (cached shell + last-known cards), clearly marked **"offline — last updated …"**.
- **Save / unsave while offline is queued** and **syncs on reconnect** (optimistic locally, reconciled on sync).
- Availability & price data **refresh on reconnect**; offline cards never claim live actionability.

---

## 13. Privacy
- A user's saved list is **strictly private to that user** — never public, never shown to the listing's poster or any other user.
- **Posters cannot see who saved their listing**, and **no public "N people saved this" counter** is shown anywhere (consistent with the product's no-view-count stance).
- Every saved-list fetch is **auth-scoped server-side** to the owning account.

---

## 14. Accessibility & Performance
- **Accessibility:** the heart is a labelled toggle (clear saved/unsaved state for screen readers), full keyboard operation, visible focus, adequate tap targets, and colour is never the only signal for a state (icon + text on availability / price chips).
- **Performance:** paginated / infinitely-scrolled grid, fixed card skeletons to avoid layout shift, branded placeholder for missing images, and graceful skeleton loaders.
- **Language:** all copy (states, chips, empty text, consent-free actions) respects the app UI language (EN / GU / HI).

---

## 15. Empty & Error States
- **No saved items** → a friendly prompt: how to save (**tap the ♥ on any listing**) + a **Browse / Explore** CTA into the feed. Never blank.
- **Filter yields nothing** (e.g. "Projects" with none saved) → a scoped message + **clear-filter** action.
- **Load error** → retry affordance, distinct from the empty state.

---

## 16. Data & States
- **Screen states:** loading · loaded · empty · filtered-empty · offline · error.
- **Per item:** listing ref · type (property/project) · saved timestamp · **price snapshot** · current price · current status · availability state.
- **Per account**, synced across devices; guest saves in session until merge (§4).

---

## 17. Rules & Edge Cases
- **Save is idempotent** — saving the same listing twice keeps **one** entry; unsave removes it.
- **Guest→account merge de-dupes** overlaps.
- **Own listings** can't be saved (owner sees Edit).
- **Unavailable items** are excluded from "Available only" and active-type filters but **retained** until removed.
- **Boost never re-orders the Saved screen** and shows **no badge** here.
- **Sensible soft cap** on saved count (and on guest-session saves); at the cap, prompt to remove some before saving more.
- **Builder** sees no inquire button on any saved item; all roles can view / share / remove.
- **Currency / units:** price in Lakh / Cr; **no map**; text location only.

---

## 18. Excluded from this Screen
- **Collections / folders** and **Compare** — **not built** (intentionally out).
- The **save action / heart UI** (on cards & the view screen) — origin defined there; here we only manage the collection.
- **Saved searches** and **recently viewed** — separate features.
- **Notification preference settings** — Edit Profile.
- No map · no EMI / loan widget · no view/save public counters.

---

## 19. Cross-screen Consistency
- **Card** → home card shortlist + anti-gap rule.
- **Save action / heart & auth gate** → cards + view screen + login sheet (home §9); **heart state syncs** across all surfaces (§11).
- **Unavailable-but-retained** → same principle as sent inquiries (leads §5) and Live-only public (view §12).
- **Inquire rules** → Buyer/Broker send, Builder cannot (view §10).
- **Boost silent, no badge, no re-rank of personal lists** (home boost rules).
- **Notifications** → in-app / email / WhatsApp (Edit-Profile §5.3), same bell as home §9.
- **Guest merge** → phone-first login/register (auth).

---

## 20. Referenced Screens (defined elsewhere)
- **listing view / detail** screen (save-action origin, inquiry, view target) · **home** (card spec, heart, auth gate, notifications bell) · **create-listing** (card field source / taxonomy) · **Leads / Inquiry** (inquiry flow, persistence pattern) · **Edit Profile** (notification prefs) · **login / register** (guest→account merge) · **admin** (listing removal that flips an item to unavailable).

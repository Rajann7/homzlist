# DOC 4 — SCREEN SPECS + UX FLOWS (PART A: USER SCREENS 1–74)

*Per-screen build spec. Global legend: **H**=header · **N**=bottom nav · **C**=components (Doc 1 numbers) · **S**=sheets/popups/toasts · **St**=states beyond standard (ALL screens have Loading skeleton/Content/Empty/Error/Offline + dark mode) · **F**=flow chain: Entry → Back → Close → Notification-landing → Deep-link · **R**=role variants. Layout/motion/states inherit Doc 1; rules inherit Doc 2. Toasts standard unless noted.*

---

## MODULE A — ENTRY & AUTH

**1. Splash** — Center: app icon 96px + wordmark below; bottom: loader dots. H:none N:none. St: update-required variant, maintenance variant. F: open → session? Feed : (saved accounts? Screen 5 : Login); no back.

**2. Onboarding** — 3 swipe cards (illustration 240px + title 20/700 + sub 15): "Find properties without spam calls" / "Chat safely, share number when YOU want" / "Post requirements, get matched"; ProgressDots; CTA "Get Started". H: Skip (top-right, tertiary). F: first-run → Login; Skip → Login.

**3. Login** — Wordmark top-center 48px-down; phone field (+91 prefix locked, numeric pad); consent line 11px (T&C/Privacy links → 69); primary btn "Continue"; "Browse as Guest" text-link below. C:17,38. St: rate-limited banner, number-locked banner (24h msg). F: Splash/guest-wall/logout → OTP; guest → Feed(guest); back = exit.

**4. OTP** — "Enter code sent to +91-98XXX" + Edit link (→3, number kept); 6 OTP boxes (auto-advance, auto-submit, WebOTP); resend countdown "Resend in 00:30" → link; attempts-left hint after 1st fail. St: wrong-OTP shake+error, attempts-exhausted (→ locked msg), resend-limit. F: →Role(new)/Feed(existing)/recycled-SIM→fresh Role; back→3.

**5. Saved Accounts** — Wordmark; account ListRows (avatar+name+number masked) → tap→OTP prefilled; "Use another account"→3. F: reopen-expired → OTP → Feed.

**6. Role Selection** — Title "I am a…"; 3 cards (icon 48 + role + 1-line: Owner "Buy, sell or rent my property" / Broker "List client properties" / Builder "Post my projects"); info ⓘ per card → popup. S: role-info dialog. F: OTP(new) → 7; back→4.

**7. Basic Details** — Avatar upload circle (tap→picker/crop sheet); name field; city selector row (→ city sheet: search + list); 18+ checkbox + DPDP consent checkbox (both required); CTA "Start Exploring". S: city sheet, photo sheet, crop. F: → Feed + coach-marks overlay (one-time); back→6.

**8. Browser Unsupported** — Icon + "Please update your browser" + Chrome/Edge links. No nav.

---

## MODULE B — HOME & STORIES

**9. Home Feed (Property mode)** — H(56px): wordmark left · **city chip** (pin icon + "Mavdi, Rajkot" + chevron, tap→city sheet, feed live-refreshes in place) · bell(badge) · messages(badge). Under H: StoryRow (edge-fade, no add-circle) → SegmentedToggle Property|Requirement → chips row (Buy/Rent + sort pill Latest▾). N: Home active (re-tap scroll-top, 2nd refresh). C: 1,2,7,10,11,30,31; cards per Doc1-C1. S: city sheet (search+recent cities), card ⋯ (Share/Report/Not interested), report sheet, inquiry sheet (→ request state; guest→login sheet), native share, PWA install card, iOS guide overlay, banner slot, "New listings" pill, caught-up marker, suggested strip, nudge card (own 0-inquiry). St: guest (actions walled), cascade-labeled sections, new-city empty (+nearby auto). F: entry from splash/nav/deep homzlist.com; scroll restore on back; bell→61 msgs→34; notif-landing: various per map; deep: / → here. R: **Builder = dashboard feed** (own stat cards: views/leads/units + matched RequirementCards locked/unlocked; no others' listings); guest no badges.

> **Layout change, 5 Aug 2026 (Rajan):** below the chips row, Property mode is a vertical stack of **horizontal carousels**, not one endless column. Order: **New Projects** (every live project) → two type rails → **Top Builders** → **Top Brokers** → the remaining type rails (property_types.sort_order) → any scheme type with no property-type home (Mixed use). **A type rail is one carousel of BOTH kinds** — boosted first (either kind), then that type's projects, then its properties; the pairing is `project_types.property_type_codes`. Each rail = title + a real count subtitle ("18 projects · 12 properties in Rajkot") + **View all** (header button and an end-of-rail tile) and pages horizontally with no limit. A type with nothing live renders **no rail at all**. The CARDS are unchanged (same FeedCard/ProjectCard, same actions, same server ranking and boosts); only the arrangement changed. Requirement mode and the Builder dashboard are untouched. API: Doc7 §78a/78b.

**10. Home Feed (Requirement mode)** — Same shell; RequirementCards (C3/C4) locked/unlocked; boosted top (locked-but-top unpaid); chips: Buy/Rent/type. S: paywall sheet, proposal compose (2-option), + Mode-9 sheets. St: unpaid locked-grid + persistent unlock banner. F: toggle from 9; state persists per device.

**11. Story Viewer** — Fullscreen #000; segment bars top; poster row (avatar 32 + name + time + ⋯[report] + X); photo center (9:16); overlay bottom: price 17/600 + BHK·area 13 + **Send Inquiry** btn; Promoted tag if boosted. Gestures: tap R/L, hold pause, swipe-down close, cube-swipe posters, auto-advance. S: inquiry sheet, report. St: "No longer available" (mid-24h sold), expired-media. F: story circle → chain → View Property→16; close/back → feed same scroll; no deep-links.

---

## MODULE C — SEARCH

**12. Search Home** — H: SearchBar full-width + mode toggle below. Body: Recent (rows + clock icon, X each, Clear all) → Popular area chips → Explore grid (mixed tiles, boosted 2×2; long-press peek popup). N: Search active. F: nav/feed-bar → 13/14/16; back→9.

**13. Search Results** — H: back + query editable + filter icon (badge count). Tabs: All|Properties|Projects|Brokers-Builders|Areas. Count line "142 properties". Landing-suggestion row. Cascade sections. C: cards + 29. S: **Filter sheet** (full: Buy/Rent, type→dynamic fields incl facing/tenant/furnishing/bath, budget dual-slider, BHK chips, location, amenities; sticky Apply + Clear-all; persists per mode), sort sheet, card sheets. St: zero-results (tips + chips + Post-requirement CTA), guest. F: 12/chips/attribute-chip/deep → 16/18/45/14.

**14. Area Page (SEO)** — H: back + area name + share. Breadcrumbs; H1 "Flats for Sale in Mavdi, Rajkot"; stats strip (count·avg price); listings grid; highlights text; price/BHK summary; Nearby-areas links; cross-links block; FAQ accordions. N:Y. F: card area-tap/Google/suggestion → 16; guest full (SEO).

**15. City Coming Soon** — Illustration + "HomzList is coming to Surat" + Notify-me btn (→toast "We'll notify you"). F: unknown-city search → back.

---

## MODULE D — DETAILS

**16. Property Detail** — H: transparent-over-photo (back/save/share/⋯ white+shadow) → solid+title on scroll-morph. Body: PhotoCarousel full-width (counter; tap→17) → price block (17→20/700 + negotiable chip | "Price on Request") + Sale/Rent badge + ₹/sqft → key specs row (BHK·bath·sqft·floor icons) → fields groups (Details/Amenities grid/Furnishing checklist) → description (2-line→More) → area highlights → price-history (drops) → poster mini-card (avatar+name+badges+response-time+member-since → 45) → similar carousel → breadcrumbs. **Sticky bar**: public# → [Call][WhatsApp][Send Inquiry] · private → [Request Number][Send Inquiry]. S: inquiry sheet, number-request confirm, share (OG card + ?ref), report, ⋯(share/report/not-interested). St: own-listing (bar→ Edit/Boost/Mark-status + stats strip; under-review watermark banner), guest walls, sold banner (inquiry off), archived, price-updated flash. F: entry card/story/search/similar/share-link/notif(approval→own view; price-drop); back→origin restore; deep /property/slug (access matrix; deleted→404→21).

**17. Photo Viewer** — #000; swipe gallery; pinch-zoom; swipe-down dismiss; counter; alt caption; save-blocked. F: 16 gallery → back 16.

**18. Project Detail** — Like 16 + status badge, RERA line, possession, towers/floors, **unit table** (rows expand: sqft/price-from/floor-plans→17), available/total, bank badges, brochure row (→ viewer/download), builder card. Sticky: [Call][WhatsApp][Inquiry] (always public). St: own (Builder: edit/units/boost), completed. F: card/story/45(builder) → chat/45.

**19. Requirement Detail** — Locked: preview fields + blurred poster + lock + "Unlock — ₹2,999/mo" → paywall. Unlocked: full fields + poster card + posted-time + proposal-count. Own: toggle (ON popup: "quota vaprase — confirm"), proposals-received link→42, Fulfilled btn (confirm), Edit, Delete (double-confirm: "count consumed rahese"). S: proposal compose (a: listing-picker sheet + message | b: chat request), paywall. St: expired badge, fulfilled, OFF. F: 10/40/41/notif(match/proposal) → chat on accept.

**20. Sold/Unavailable** — Banner art + "This property is no longer available" + similar grid. F: old shared links.

**21. 404 / Crash / Generic Error** — Art + Home/Search btns · crash: Reload.

---

## MODULE E — CREATION

**22. Plan Wall** — H: X. Plan cards role-filtered (price 24/700 + checklist + CTA); comparison link→sheet; coupon row. S: comparison sheet, coupon states. F: + (no slot) → 28; X→origin.

**23. Post Type** — H: X "Create". Role grid: Sell/Rent/Requirement/(+New Project builder). Unsaved n/a. F: header + / My Listings + / empty-CTAs → 24/30/31.

**24. Property Type** — H: back + progress. Category accordions → type grid (icons). Role-filtered. F: →25.

**25. Listing Form** — H: X(unsaved popup: Save draft/Discard) + "Save draft" + progress dots. Sections (Doc2 §5.1 fields; per-type show/hide; title hint auto; auto-title btn; desc template; price C23; location C24 cascading sheets + Request-area link; details per type; contact toggles; ownership-proof optional upload). S: every selector sheet, unit converter, area-request, unsaved popup. St: draft-restored banner, inline server errors, warnings (never block). F: 24/32(resume)/33(edit prefilled) → 26; back=X-popup.

**26. Photos** — H: back + count X/10|∞ + Next. Sample-guide overlay (one-time). PhotoGrid C27 (reorder/Cover/per-tile ⋯ edit-alt-delete/progress/retry). Builder: bulk + brochure tile (scan state). S: editor sheet (crop/rotate/brightness), guide. F: →27.

**27. Preview** — Tabs Card|Full (exact renders). H: back + "Submit for Review". F: → slot-paid? 29 : 28.

**28. Checkout** — Summary line-items; GSTIN field (optional); coupon; Razorpay launch. St: processing/pending-UPI (auto-poll + "safe to close"), failed(+Retry), double-pay guard note. F: 22/27/58/60 → 29/pending; payment-notif → here/56.

**29. Success** — ✓ animation + "Under review" + timeline note + Preview link + "Go to My Listings". F: →49.

**30. Requirement Form** — Fields Doc2 §7; areas multi-sheet; urgency chips. Same shell as 25. F: →29 variant ("Requirement under review").

**31. Project Form (Builder)** — Multi-step: Basics(RERA req/exempt+reason) → Units repeater (add: type/sqft/price-from/plans) → Media(+brochure) → Location → Preview → ₹9,999 checkout → 29. St: per-step validation.

**32. Drafts** — Rows (thumb+title+expiry countdown) + Resume/Delete(confirm). Max-3 note. F: profile/25-X → 25.

**33. Edit Listing** — 25 prefilled + banner ("Photos/location changes need re-review"); status actions (Available/Sold/Rented/Completed confirm popups); Re-activate (rented); Restore (archive/trash). F: 49/16-own → re-review flow.

---

## MODULE F — MESSAGES & CHAT

**34. Messages Home** — H: "Messages" + search + ⋯(mark-all-read). 4 TabBar: My Listings|My Inquiries|Requirement Leads|My Responses. Per tab: Requests row (count → 35; Verified/Others sub-tabs) → unread filter toggle → grouping toggle (per-listing collapsible "Property X — 45") → chat ListRows (avatar/name+badge/listing-thumb/preview/time/unread/pin). Tab4: proposal-status header strip → 43. S: long-press sheet (pin/mute/archive/delete/block), swipe actions, bulk bar. St: 4 unique empties (Doc1 §10); archived section (auto-unarchive). F: nav/feed-icon/notif(inquiry→thread) → 36; back→9.

**35. Requests** — Cards: full first message + rich attached card + trust strip + [Accept][Decline][View Profile]; preview-no-seen. Proposal variant: sender number visible + listing card. St: Verified|Others tabs. F: tab-row → accept→36 / decline(cooldown note).

**36. Chat Thread** — H: back + avatar + name + badges + role (tap→37/45) + ⋯(mute/block/report/not-interested). PinnedBar C22 (live price + flash line). Body: bubbles C13 full behavior set (Doc2 §10.2: ticks/seen-time/typing/reactions/swipe-reply+jump/copy/report-msg/delete/photos/link-preview+caution/number-warning/system token-card/date separators sticky/unread divider+open-position/50-pagination/jump-pill). Tools row: quick replies (defaults+custom→manage sheet); [Request Number](sender) / inline Allow-Deny (poster, confirm dialog); NumberCard on allow (reveal anim); VisitScheduler card flow (propose→confirm→remind→reschedule/cancel→outcome prompt); post-call continuity prompt; Not-interested close. Input: keyboard-aware, draft persist, optimistic. S: reactions picker, attach, visit sheet, templates manage, block/report, number confirm. St: request-pending (sender "waiting"), declined-cooldown, archived-listing banner (send ON), requirement-expired banner, deleted-user, blocked, offline-queue ("Sending…"). F: 35-accept/34/notif(msg/number→inline)/deep thread-id(auth); back→34 same tab.

**37. Chat Details** — Participants; shared photos grid; shared cards; mute/block/report rows. F: 36 header.

**38. My Visits** — Date-section list: VisitCards (listing thumb+time+status chip+outcome btns). F: profile-activity/36 → 36/16.

**39. Leads Pipeline** — H: back "Leads" + export + filter. Stage segmented (New/Contacted/Visit/Negotiation/Closed) → LeadCards (trust strip) → tap 36; move-stage sheet; CSV export (toast). R: broker/builder full; owner simple list. F: 44-stats/34 ⋯.

---

## MODULE G — REQUIREMENTS

**40. Requirements Browse** — H: "Requirements" + my-icon(→41) + filter. Body: cards locked/unlocked; boosted top; cascade sections. N: center active. S: paywall, proposal compose, filter. St: unpaid locked-grid + unlock banner. F: nav → 19; back→9.

**41. My Requirements** — Cards: status chips (Active/Expired/OFF/Fulfilled) + toggle (ON=quota popup) + proposals count→42 + matching-strip (reverse-match carousel) + Edit/Delete(double-confirm) + Renew CTA. F: 40-icon/44-tab/notif(expiry).

**42. Proposals Received** — Per-requirement list: ProposalCards C5 (number visible+copy; listing card; trust) + [Accept→36][Decline][Not relevant]. Unlimited. F: 41/notif(proposal).

**43. My Proposals Sent** — Status list rows (requirement ref + status chip + expired/fulfilled indicators + resend-blocked). F: 34-tab4 header/51.

---

## MODULE H — PROFILE

**44. Own Profile** — H: username + account-switch chevron (sheet) + create + + ⋯(→62/52/view-as). ProfileHeader C12 (collapsing) + stats(tap: Listings→49, Views→info, Leads→39) + Edit/Share btns + Featured circles + pinned row + grid tabs swipeable (role-based) + grid/list toggle + ribbons. Own-tile tap→48. N: Profile active. S: switch sheet, share/QR, view-as banner mode. F: nav; back→9.

**45. Other Profile** — Public header (badges/about/response) + Message btn + Call/WhatsApp (verified+public) + ⋯(report/block/share) + listings grid (tap→16). St: suspended "unavailable", deleted. F: cards/36/42 → 16/36.

**46. Edit Profile** — Rows: photo(sheet), name, bio(flag-note helper), city(sheet+feed note), number(→dual-OTP mini-flow screens), builder extras. F: 44.

**47. Verification** — Level cards: Phone ✓done → ID (doc type + upload → pending/approved/rejected+reason) → RERA (number + doc). St: revoked banner. F: 46/broker-nudge.

**48. Listing Stats (own)** — Hero card + metrics rows (views unique/day, saves, shares, leads→list→36) + boost status/CTA→58 + status actions. F: 44-tile/49.

**49. My Listings Manager** — Filter chips (Live/Pending/Changes/Rejected/Hidden/Archived + Trash link→53) → cards with state-specific actions + field-notes inline (changes-requested) + expiry banners (inline Yes/No) + [+]. F: 29/44/notif(approval/expiry) → 33/48.

**50. Saved** — Folder chips (+New/rename/delete) → grid; move-sheet; status-alert badges. F: nav-profile/toast-View → 16.

**51. Activity** — Sections: Recently viewed / Liked / Inquiries sent / Proposals→43 / Visits→38. F: 62/44 ⋯.

**52. QR & Share** — QRCard C40 + link row + native share. F: 44-share.

**53. Trash** — 30-day rows + Restore + auto-purge note. **54. Archived** — grid + Restore(re-review note). F: 62/49.

---

## MODULE I — PLANS & BOOST

**55. Plans** — Role-filtered cards + comparison table + coupon + active strip. F: 22/62/CTAs → 28.

**56. My Plan** — UsageBars per plan + pooled totals + consumed-trace list + expiry+Renew + grace banner + Top-up btn(→60). F: 62/limit-CTAs/notif(expiry/grace).

**57. Payment History** — Transaction rows (status chips: success/pending/failed+Retry/refunded) → detail sheet + invoice download/resend. F: 62/notif(refund).

**58. Boost Purchase** — Eligible-listing picker → duration cards (rates) → targeting selector (city/state/India) → summary → 28. St: pending-approval, rejected+refund note. F: 16-own/48/49 ⋯ → 59.

**59. Boost Status** — Active list ("till date") + queue + renew-1-tap. F: notif(boost).

**60. Top-up Sheet** — +10 proposals card + pay inline. Contextual (proposal-flow) + standalone (56).

---

## MODULE J — SETTINGS & SYSTEM

**61. Notifications** — H: back + ⋯(mark-all). Groups Today/Week/Earlier; rows (icon+thumb+2-line+time) + inline Allow/Decline (number requests). Deep-link map per type (Doc2 §14). F: bell/push → mapped screens; back→origin.

**62. Settings** — ListRows sections: Account(number/email/city) · Notifications→63 · Language→64 · Privacy(number default, last-seen) · Login activity→65 · Blocked→66 · Saved/Archived/Trash · My Plan→56 · Payments→57 · Help→67 · Support→68 · Legal→69 · Data download→70 · Deactivate/Delete→71 · version footer. F: 44 ⋯.

**63. Notification Prefs** — Category toggles + marketing separate + channel note. **64. Language** — radios EN/GU/HI → instant swap (position kept). **65. Login Activity** — session rows + logout each/all + alerts history. **66. Blocked** — rows + Unblock confirm.

**67. Help/FAQ** — Search + category accordions (CMS). **68. Support** — Ticket list + New (category incl. refund/number-recovery; payment-ID field; attachments) + thread view (auto-ack + ticket #). F: 62/error-CTAs/grievance links.

**69. Legal** — CMS pages list → readers (T&C/Privacy/Refund/Disclaimer/About/Grievance Officer info). Guest-accessible; footer links. Re-acceptance interstitial variant. **70. Data Download** — request → processing → ready notification + download. **71. Deactivate/Delete** — explainer cards + forfeit warnings + 7-day-hold note + double-confirm + OTP re-verify → grace state.

**72. Blog List/Post** — CMS; share; SEO; guest. **73. Offline Page** — branded + cached note + Retry. **74. Maintenance** — branded + ETA slot (admin bypass invisible).

---

## GLOBAL FLOWS (apply everywhere)
- Back: sheet→close first; viewer→close; else screen-back with scroll restore. PWA back at root = default exit.
- Notification landing map (Doc2 §14) authoritative; all deep-links auth-checked SSR (Doc3 §3.2).
- Guest wall sheet on any gated action → login → return to intended action.
- Offline: banner + queued actions + auto-retry toast. Coach marks: one-time per major screen. Cookie banner: guest first visit. T&C interstitial on version change.

---

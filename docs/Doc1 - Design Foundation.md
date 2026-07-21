# DOC 1 — HOMZLIST DESIGN FOUNDATION (Complete)

*The single source of truth for every visual and interactive decision. Every screen, component, and design generated for HomzList MUST follow this document exactly. Nothing here is optional.*

---

# SECTION 1 — DESIGN SYSTEM

## 1.1 Color Palette (Light Mode)

**Base & Surfaces**
- `--bg-page`: #FFFFFF (main background)
- `--bg-page-desktop`: #FAFAFA (outside centered column, Instagram-web style)
- `--surface-1`: #FFFFFF (cards, sheets, headers)
- `--surface-2`: #F5F5F5 (input fields, inactive chips, pressed rows, secondary surfaces)
- `--surface-3`: #EFEFEF (skeleton base, dividers-strong)
- `--border`: #DBDBDB (Instagram's exact border gray — hairline borders, 0.5–1px)
- `--divider`: #EFEFEF (list separators)

**Ink (Text) Scale**
- `--ink-primary`: #111111 (titles, prices, primary text)
- `--ink-secondary`: #555555 (body, descriptions)
- `--ink-tertiary`: #8E8E8E (Instagram's meta gray — timestamps, captions, placeholders)
- `--ink-disabled`: #C7C7C7
- `--ink-inverse`: #FFFFFF (text on dark/photo/accent)

**Trust Green (Brand Accent — Option B)**
- `--accent`: #0F9D58 (primary CTA, active states, links, verified)
- `--accent-pressed`: #0C7C46
- `--accent-soft`: #E6F4EC (soft backgrounds: selected chips, success banners, badge bg)
- `--accent-disabled`: #A8D5BD

**Semantic**
- `--error`: #ED4956 (Instagram's red — errors, destructive, unread dots)
- `--error-soft`: #FDECEE
- `--warning`: #F5A623 (Rent badge, expiry warnings)
- `--warning-soft`: #FEF5E7
- `--info`: #0095F6 (Instagram blue — informational links only, used sparingly)
- `--info-soft`: #E7F3FD

**Overlays & Scrims**
- `--scrim-sheet`: rgba(0,0,0,0.40) (behind bottom sheets)
- `--scrim-viewer`: rgba(0,0,0,0.60) (photo viewer, story viewer bg = #000)
- `--gradient-photo`: linear-gradient(transparent 60%, rgba(0,0,0,0.60) 100%) (bottom 40% of photos carrying text)

## 1.2 Color Palette (Dark Mode — paired tokens)

- `--bg-page`: #000000 · `--bg-page-desktop`: #000000
- `--surface-1`: #121212 · `--surface-2`: #1E1E1E · `--surface-3`: #262626
- `--border`: #363636 · `--divider`: #262626
- `--ink-primary`: #F5F5F5 · `--ink-secondary`: #B0B0B0 · `--ink-tertiary`: #8E8E8E · `--ink-disabled`: #4D4D4D
- `--accent`: #1DB868 (brighter for dark) · `--accent-pressed`: #17A05A · `--accent-soft`: #0E2B1C
- `--error`: #FF5C6A · `--error-soft`: #2B1214 · `--warning`: #FFB74D · `--warning-soft`: #2B2210 · `--info`: #3BA7F8 · `--info-soft`: #0F2233
- Shadows OFF in dark mode → replaced by `--border` outlines
- Photos get 6% black overlay dim (Instagram dark-mode treatment); badges on photos keep light-mode colors (contrast)

**Rule: components reference ONLY semantic tokens (e.g., `--price-text` → `--ink-primary`), never raw hex. Dark mode = token swap, zero component changes.**

## 1.3 Typography

- **Font stack (locked, English-only designs)**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` — Instagram's exact stack. No other font anywhere.
- **Scale & roles**:
  - 24px / 700 — screen titles (rare: onboarding, plan prices)
  - 20px / 700 — page headers (logo wordmark area, section heroes)
  - 17px / 600 — card price, sheet titles, primary emphasis
  - 15px / 400 — body, chat messages, descriptions; 15px/600 for buttons & tab labels
  - 13px / 400 — secondary meta (location, counts); 13px/600 usernames, chip labels
  - 11px / 400 — timestamps, captions, badges (11px/600 for badge text, uppercase +0.3px letter-spacing)
- **Line-heights**: headings 1.25 · body 1.45 · single-line labels 1.2
- **Truncation rules (locked per component)**: card title 1 line ellipsis · location 1 line · description preview 2 lines · chat preview 1 line · notification text 2 lines · area names in chips 1 line max 120px
- **Numbers**: prices always `--ink-primary` 600+; Indian format ₹85 Lakh / ₹1.2 Cr / ₹15,000/month

## 1.4 Spacing (8px system)

- Scale: 4 / 8 / 12 / 16 / 24 / 32 (only these values)
- Screen gutters: 16px · card internal padding: 12px · list row padding: 12px vertical, 16px horizontal · section gaps: 24px · related-element gaps: 8px · icon-to-label: 8px · chip internal: 6px vertical 12px horizontal

## 1.5 Border Radius

- 4px — badges, tiny elements
- 8px — cards, inputs, buttons (standard)
- 12px — sheets' top corners, large cards, images-in-cards
- 16px — modals/dialogs
- full (999px) — chips, pills, avatars, story rings, FAB

## 1.6 Shadows (Light mode only)

- Level 0: none (flat lists)
- Level 1: `0 1px 2px rgba(0,0,0,0.06)` — cards at rest
- Level 2: `0 4px 12px rgba(0,0,0,0.10)` — sticky bars, raised pills ("New listings")
- Level 3: `0 8px 24px rgba(0,0,0,0.16)` — sheets, dialogs, popovers
- Dark mode: all levels → 1px `--border` outline instead

## 1.7 Icon Style

- Library: single outline set (Lucide/Feather class), 24px default, 1.5px stroke, round caps — matches Instagram's visual weight
- Small variant 20px (inside chips/rows); nav icons 26px
- Fill-state pairs (outline→filled on active): Save 🔖, Heart, Home, Bell, Message
- Icon color: `--ink-primary` default; `--ink-tertiary` secondary; `--accent` active; on-photo: white 92% opacity + `0 1px 2px rgba(0,0,0,0.3)` shadow
- NO cartoon, rounded-bubble, duotone, or emoji-style icons anywhere

---

# SECTION 2 — COMPONENT LIBRARY (40 components)

*Each listed with anatomy → variants. States for ALL components in Section 5.*

1. **PropertyCard (feed)** — 4:5 photo carousel (dots + 1/6 counter + swipe-hint first-run) → row: price (17/600) + Sale/Rent badge → BHK · sqft · ₹/sqft (13/`--ink-secondary`) → location w/ pin icon (13/`--ink-tertiary`) → poster row (24px avatar + name 13/600 + VerifiedBadge + role tag) → action bar: Save icon (left), **View Property** (secondary btn) + **Inquiry** (primary btn) right, ⋯ overflow. Promoted tag top-left on photo. Double-tap heart zone = photo.
2. **ProjectCard** — same shell; ring-color poster avatar, "New Project" badge, units-from line ("2/3BHK from ₹45L"), possession chip; CTA: **View Project** + **Inquiry**.
3. **RequirementCard (unlocked)** — no photo; top row: type chip + Buy/Rent chip + urgency chip → budget range (17/600) → areas line (chips, +2 overflow) → poster row (name+badge+city) → posted time → CTA: **Send Proposal**. Accent-soft left border 3px.
4. **LockedRequirementCard** — same layout; poster row blurred (CSS blur 6px) + lock icon; details masked ("2BHK · University Road · Rent" only); CTA: **Unlock — ₹2,999/mo** (accent). Boosted-locked = same + Promoted tag.
5. **ProposalCard (received)** — sender row (avatar+name+badges+**number visible** with copy icon) → message text (2-line expand) → attached listing mini-card (rich) → trust strip (member-since · profile %) → actions: Accept / Decline / Not relevant.
6. **LeadCard** — buyer row + trust strip → listing thumb + title → last activity + stage chip → tap→chat.
7. **StoryCircle** — 64px avatar in 2.5px gradient ring (unseen: accent gradient; seen: `--border`; project: blue-tint gradient; boosted: gold-tint) + 11px name below (1-line) + pulse animation on new.
8. **BottomSheet** — 12px top radius, 32px drag-handle zone (36×4px pill `--surface-3`), title row (17/600 + X right), content, safe-area bottom pad; max-height 90%; stacking supported.
9. **Toast** — dark pill (#262626/dark:#EFEFEF inverse), 13px white text, bottom 80px (above nav), slide-up 200ms, 3s hold, optional action link ("View").
10. **Chip** — full-radius, `--surface-2` default / `--accent-soft`+accent-text selected; 13/600.
11. **FilterChip** — chip + count dot when active; leading icon optional.
12. **ProfileHeader** — 84px avatar (+story ring if active) → name+badges row → bio (2-line) → meta line (member-since · response-time) → StatsRow → button row (Edit/Share or Message/Contact) → collapses on scroll (avatar→32px, sticks with tabs).
13. **ChatBubble** — sent: `--accent-soft` right-aligned; received: `--surface-2` left; 15px text, 11px time+ticks inside bottom-right; radius 16px (4px on tail corner); reactions chip below; quoted-reply block inset.
14. **Skeleton** — `--surface-3` base + shimmer sweep 1.2s; shapes per component (card/list/grid/chat/profile sets).
15. **EmptyState** — 96px line-art illustration (single-color `--ink-tertiary` + accent detail) + title 15/600 + subtitle 13 + CTA button; unique per context (Section 10 list).
16. **ErrorState** — same shell, error illustration + Retry.
17. **Button** — Primary (accent bg, white 15/600, 44px h, 8px radius) · Secondary (surface-2 bg, ink text) · Outline (border, transparent) · Destructive (error bg) · Text-link (accent, no bg) · Icon-button (44×44) · sizes: default 44 / small 36.
18. **StatusBadge** — 4px radius, 11/600 uppercase: Promoted (black 60% on photo, white text) · Verified (accent-soft/accent) · Sold (ink-primary bg white text diagonal ribbon on grids) · Rented (warning) · Under Review (info-soft/info) · Expired (surface-3/ink-tertiary) · Changes Requested (warning-soft) · For Sale (accent-soft) · For Rent (warning-soft) · New Project (info-soft) · Fulfilled (accent-soft ✓).
19. **VerifiedBadge** — 3 levels: Phone ✓ (gray outline check) · ID ✓ (accent outline) · RERA ✓ (accent filled) — 14px inline.
20. **NumberCard (chat)** — surface-2 card: phone icon + number 17/600 + Copy btn + Call btn (accent); reveal animation.
21. **VisitSchedulerCard** — date/time chips grid → confirmed state (accent border + calendar icon) → outcome prompt variant (3 buttons).
22. **PinnedListingBar (chat top)** — 48px thumb + title 1-line + price + chevron; "Price updated" flash variant.
23. **PriceInput** — top label + ₹ prefix + live comma formatting + word-confirm helper below ("₹85 Lakh") + negotiable/on-request toggles.
24. **LocationCascadeSelect** — stacked select rows (State→…→Pincode), each opens search-list sheet; selected shows breadcrumb chips.
25. **UnitConverter** — value input + unit dropdown + auto-line "≈ 60,500 sq ft" (`--ink-tertiary`).
26. **PhotoCarousel** — swipe, dots (active 6px accent / inactive 4px 50% white), counter pill top-right, edge-peek none (full-bleed).
27. **PhotoGrid (upload)** — 3-col tiles, drag-handle, Cover label tile-1, per-tile ⋯ (edit/alt/delete), progress ring per tile, failed-retry chip, add-tile dashed.
28. **SearchBar** — 40px, surface-2, radius 8, leading search icon, clear ×; autocomplete dropdown panel (recent w/ clock icon, suggestions w/ pin, landing-pages w/ grid icon).
29. **TabBar (in-screen)** — text tabs 15/600, active = ink-primary + 1.5px underline (accent), inactive = ink-tertiary; swipeable content.
30. **SegmentedToggle (Mode)** — pill container surface-2, sliding thumb white+shadow, 2 options (Property/Requirement), 250ms slide.
31. **SortPill / CountBadge** — pill w/ chevron · red dot 8px / count badge 16px error bg.
32. **Avatar** — sizes 24/32/48/64/84; image or initials on accent-soft; fallback icon.
33. **ListRow** — 48–56px, leading icon/avatar + title/subtitle + trailing chevron/toggle/value; divider full-bleed under text.
34. **SectionHeader** — 13/600 `--ink-tertiary` uppercase +0.3ls; cascade variant: "Nearby: University Road" with location icon.
35. **CoachMark** — dark tooltip + arrow + pulse-dot on target + "Got it"; sequence dots.
36. **PaywallSheet** — plan hero price 24/700 + feature checklist (accent checks) + CTA + comparison link + coupon row.
37. **ConfirmDialog** — 16px radius centered modal (max 320px): title 17/600 + body 13 + button row (destructive = error primary); double-confirm variant (count-warnings).
38. **InlineFieldError** — 11px error text + 14px error icon below field; field border → error.
39. **RichLinkPreview / SystemMessageCard** — link: thumb+title+domain+caution label; system: centered surface-2 card 13px w/ warning icon (token warning, price-updated).
40. **UsageBar / StatsRow / QRCard / BannerSlot / Pill / UploadTile / OGShareCard** — usage: label + n/n + accent progress; stats: 3 equal columns (number 17/700 + label 11); QR: white card, logo-center QR, name+role, share row; banner: 16:5 image slot + × dismiss; pill: floating Level-2 shadow accent bg ("↑ New listings"); OG template: 1200×630 — cover photo + bottom bar (logo + price 700 + title + area).

---

# SECTION 3 — LAYOUT RULES

- **Mobile**: 100% width, 16px gutters, content max = screen; min supported 320px
- **Desktop/Tablet**: centered column **470px** (Instagram-web), `--bg-page-desktop` outside, hairline column borders; NO separate desktop layout; admin panel exception: sidebar 240px (collapsible→64px icons) + fluid content max 1200px
- **Header**: 56px + safe-area-top; title/logo left or center per screen; icon buttons 44×44 right-aligned 8px apart
- **Bottom Nav**: 50px + safe-area-bottom; 5 items equal; icon 26px + optional 10px label (icon-only, Instagram style — locked); active = filled + ink-primary, inactive = outline + ink-primary 100%/gray per Instagram (ink-primary both, fill indicates)
- **Profile grid**: 3-col, 2px gaps, 1:1 tiles
- **Feed**: cards full-bleed to gutters, 8px between cards, hairline dividers optional off (card shadows separate them)
- **Sticky bottom bar (detail)**: 64px + safe-area, surface-1 + top hairline + Level 2
- **Sheets**: max-h 90%, min-h content, land at content height
- **Safe areas**: iOS notch/home-indicator env() insets everywhere fixed elements exist
- **Z-index scale**: content 0 · sticky bars 10 · header 20 · bottom nav 20 · dropdown 30 · sheet scrim 40 · sheet 41 · dialog 50 · toast 60 · story/photo viewer 70 · coach marks 80
- **Touch targets**: min 44×44px ALL tappables (icons get padding to reach it)
- **FAB/+ placement**: header-right on Profile & My Listings; no floating FAB on feed (header + creates)

---

# SECTION 4 — MOTION REFERENCE

*All: transform/opacity ONLY (60fps GPU rule). Global easing `cubic-bezier(0.2, 0, 0, 1)` (ease-out). Reduced-motion: durations→0, shimmer→static, springs→fades.*

- **Bottom sheet**: in 300ms spring (slight overshoot), out 250ms; drag-follow finger; dismiss if velocity >0.5px/ms or >50% dragged; scrim fades in parallel
- **Page transition**: forward slide-in-right 250ms; back slide-out 200ms; swipe-back follows finger from left edge (edge zone 20px)
- **Card press**: scale 0.98 + surface darken 4%, 100ms in / 150ms release
- **Double-tap heart**: 0→1.2→1.0 scale, 400ms, opacity fade-out 300ms after 200ms hold; save-icon syncs fill
- **Story**: segment linear 5s; user-swipe cube-transition 300ms (Instagram cube); progress pauses on hold (scale-down 0.98 subtle)
- **Pull-to-refresh**: pull-follow 0.5 resistance; trigger at 64px (haptic tick); spinner accent 18px; release spring-back 300ms
- **Skeleton shimmer**: 1.2s loop, gradient sweep left→right
- **Toast**: up 200ms, hold 3s, down 200ms
- **Tab switch**: content crossfade 150ms + underline slide 200ms
- **Story ring pulse (new)**: ring scale 1→1.06→1, 2s ease, ×3 then stop
- **Number card reveal**: fade+rise 8px, 300ms + subtle accent flash
- **Header scroll morph**: 56→48px height, title 17→15px, over first 80px scroll, linked to scroll position (not timed)
- **"New listings" pill**: drop-in from -20px + fade 250ms
- **Like/nav icon fill**: 150ms scale 1→0.85→1 with fill swap
- **Keyboard shifts**: input bar translates with keyboard (visualViewport), 250ms matching OS curve

---

# SECTION 5 — COMPONENT STATES MATRIX

*Every interactive component defines: Default / Pressed / Loading / Disabled / Active-Selected / Error / Focus.*

- **Buttons**: pressed = `--accent-pressed` + scale 0.98 · loading = spinner replaces label (width locked) · disabled = `--accent-disabled` + no events · focus = 2px accent outline offset 2
- **Inputs**: default border `--border` · focus border accent 1.5px · error border `--error` + InlineFieldError · disabled surface-2 + ink-disabled · filled = ink-primary
- **Chips**: pressed darken 6% · selected accent-soft/accent text + optional ✓ · disabled 40% opacity
- **Cards**: pressed (whole-card tappables) scale 0.98 · loading = skeleton twin · selected (pickers) = accent border 1.5px
- **ListRow**: pressed surface-2 flash · destructive rows error text
- **Toggle**: off surface-3 thumb-white · on accent · disabled 40% · loading = mini spinner in thumb
- **Tabs**: active ink+underline · inactive tertiary · disabled 40%
- **StoryCircle**: unseen/seen rings · pressed scale 0.95 · loading = ring rotates
- **Save icon**: outline→filled accent pop · syncing = 60% opacity
- **Sheet rows**: pressed flash · destructive = error text + icon
- **Send button**: disabled (empty input) tertiary → enabled accent 150ms fade
- **Upload tile**: uploading ring % · failed = error border + retry chip · done = fade-in image

---

# SECTION 6 — SCREEN FLOW MAP (visual spec — diagrams render in Docs 4/5)

Core chains (every screen's entry/back/close/popup/notification/deep-link lives in Doc 4/5 per-screen; global rules here):
- **Auth**: Splash → [session? Feed : Login] → OTP → [new? Role → Details → Feed+coach : Feed] · Back from OTP = Login (number kept)
- **Browse**: Feed ⇄ Story Viewer → Property Detail → (Inquiry sheet → Request state → Chat on accept) / Profile / Similar → Detail…
- **Create**: + → [slot? Type : PlanWall → Checkout] → Type → PropType → Form ⇄ Drafts → Photos → Preview → [payment?] → Success → My Listings
- **Requirement**: Requirements tab → [paid? cards : locked+Paywall] → Detail → Proposal sheet → Requests (poster) → Chat
- **Messages**: Nav → 4 tabs → Requests → Accept → Thread → (Number request → Allow → NumberCard) → Details
- **Boost**: Listing ⋯/Stats → Boost purchase → Checkout → Pending → Active
- **Notification landings (mapped)**: inquiry→thread · approval→listing detail(own) · number-request→thread(inline allow) · price-drop→detail · match→requirement/area list · plan-expiry→My Plan · report-outcome→Account status
- **Deep links**: /property/slug → Detail (state-access matrix) · /flats-for-sale-in-… → Area page · /profile/x → Profile · unknown → 404
- **Back global**: sheets close first → then screen back → feed root back = exit-confirm none (PWA standard); story/viewer back = close viewer

---

# SECTION 7 — IMAGERY, OVERLAYS & HIERARCHY

- **Aspect ratios locked**: FeedCard 4:5 · StoryCover 9:16 · ProfileGrid 1:1 · DetailGallery full-width natural (letterboxed `#000` in viewer) · Avatars 1:1 circle · BannerSlot 16:5 · OG 1200×630. Mixed uploads: cover-crop to slot (4:5 suggest at upload), never stretch — carousels NEVER jump height
- **Overlay rules**: text-on-photo only within bottom 40% gradient zone; top badges get 60% black chip bg (no gradient top); icons on photo white 92% + shadow; gradient never on grids (ribbons instead)
- **Card hierarchy (locked order/weight)**: 1 Photo → 2 Price (17/600) → 3 BHK·Area (13 secondary) → 4 Location (13 tertiary) → 5 Poster (13/600 + badge). Nothing may visually outrank price except photo
- **Dark-mode photos**: 6% dim overlay; badge colors unchanged
- **Placeholder imagery (designs)**: realistic property photos (real-estate stock style — exteriors/interiors), never gray boxes in final designs; blur-up = 20px-blurred thumb → crossfade 300ms

---

# SECTION 8 — KEYBOARD & INPUT BEHAVIOR

- Chat: input bar rides keyboard top (visualViewport), messages push up, jump-pill respects offset; emoji/attach icons stay in bar
- Sheet + keyboard: sheet rises with keyboard; if content taller → internal scroll; drag-handle remains
- Forms: focused field auto-scrolls into view 16px above keyboard; Next-field keyboard action; numeric pads for phone/price/OTP; search keyboards show Search action
- OTP: auto-advance boxes, auto-submit on 6th, WebOTP autofill
- Never let keyboard cover an active input or the send/submit button

---

# SECTION 9 — STATUS & BADGE SYSTEM (single language)

All badges = Component 18 spec. Placement: photo badges top-left (Promoted) / top-right (counter) · grid ribbons diagonal top-right (Sold/Rented) · inline badges after names (Verified) · card-top row (Sale/Rent/type) · review states banner-style on own items (full-width soft bg strip). Max 2 badges on any photo. Text always 11/600 uppercase.

---

# SECTION 10 — EMPTY, ERROR, OFFLINE & MICRO-STATES

**Empty states (each = unique line-art + title + subtitle + CTA):**
- No Chats — Tab1 "No inquiries yet" + Boost CTA · Tab2 "You haven't inquired" + Explore CTA · Tab3 "No proposals yet" + boost-requirement CTA · Tab4 "No responses sent" + Browse requirements CTA
- No Listings (+ Create CTA) · No Saved (+ Explore) · No Requirements (unpaid: unlock pitch / paid: none-posted + Post CTA) · No Results (spelling tips + popular chips + Post-requirement CTA) · No Notifications · No Visits · No Proposals-sent · No Drafts · Empty Feed new-city ("Listings coming soon" + Post CTA + nearby cascade auto) · No Leads · Empty Trash/Archive · No Blocked users · No Payment history
**Error/system**: 404 (compass art) · Crash ("Something went wrong" + Reload) · Offline page (branded, cached-feed note) · Maintenance (tools art + ETA slot) · Payment-failed (retry) · Upload-failed (per-tile) · Session-expired (→ login, draft-safe note)
**Offline behaviors**: banner "No connection" top (below header, warning-soft), cached feed browsable, actions queue with clock-icon states, auto-retry on reconnect + success toast

---

# SECTION 11 — INTERACTION EXTRAS (locked)

- **Haptic map**: light tick = like, save, refresh-trigger, sheet-snap, tab-switch · medium = send message, submit success · error buzz = failed action, wrong OTP
- **Scroll rules**: position restore on back & tab-return · chat opens at unread divider · tab re-tap scroll-top→2nd tap refresh · iOS momentum + bounce preserved (no scroll hijack) · edge fades on story row (16px) & filter chip rows
- **Overscroll**: pull shows `--bg-page` + spinner zone; header stays pinned during bounce
- **Selection patterns (decision table)**: 2–4 options = chips · 5–15 = radio sheet · 15+ = search-list sheet · binary = toggle · multi = checkbox chips/sheet
- **Confirmation hierarchy**: normal = inline/toast · reversible-destructive = sheet w/ red button · irreversible or count-consuming (delete requirement w/ count, number-allow) = ConfirmDialog double-confirm with consequence line
- **Number/date formats**: 12.4K · ₹85 L · ₹1.2 Cr · ₹15,000/month · 2h ago / Yesterday / 12 Jan / 12 Jan 2025 · distances "Mavdi · 2.1 km"
- **Loading choreography**: header instant → skeletons 0ms → stories+cards stagger 50ms/item → images blur-up; never full-screen spinner on main screens (skeletons only); spinners allowed in buttons/sheets

---

# SECTION 12 — ACCESSIBILITY & BRAND ASSETS

- Contrast AA minimum all text (verified against both modes); focus rings (2px accent, offset 2) on all interactive for keyboard; alt-text slots on all imagery; reduced-motion honored; touch 44px enforced; form labels always visible (top-label pattern, no placeholder-only)
- **Brand set (placeholder, admin-changeable)**: HomzList wordmark — "Homz" ink-primary 700 + "List" accent 700, geometric sans; app icon = accent rounded-square + white "H" house-notch mark; favicon 32px same; splash = icon center + wordmark below; OG-default = accent bg + wordmark + "Properties without spam calls" tagline
- **Error illustration family**: single-stroke line art, `--ink-tertiary` strokes + one accent element each — consistent across 404/offline/maintenance/crash/empty set

---

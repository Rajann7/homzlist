# DOC 6 — HOMZLIST BUILD GUIDE (Part 1 of many)

*The master build manual. Claude Code follows this exactly to turn the 13 designs + 5 spec docs into a production-ready website, token-efficiently, with nothing missed. Design as-is (mobile 0% change), backend-driven, secure, 100Cr-scalable.*

---

# SECTION 0 — HOW TO USE THIS DOC

This guide is written for **Claude Code** (terminal/desktop). You (the founder) paste module prompts one at a time; Claude builds, self-tests, reports; you verify; next module. Nothing is built from memory — every module cites exact design + spec files.

**Golden rules (never violated):**
1. **Design is final.** The mobile design in `designs/` is implemented pixel-exact. Claude never redesigns, "improves," rearranges, or restyles. Every popup, sheet, toast, alert, dialog, notification shown in the design is kept exactly as-is — same look, position, behavior — only wired to work.
2. **Desktop/Tablet = separate native layouts** (user-side only), built fresh looking at the mobile design, **without changing the mobile design by even 0.001%**. Admin (P13-14-15) is exempt — it already has all 3 device layouts.
3. **Everything backend-driven.** No business data in frontend/localStorage. Server decides everything (auth, paid-status, numbers, locked content).
4. **Nothing skipped.** Every screen, sheet, state, flow, rule from the spec is built and verified working.
5. **Token-efficient always** (Section 3).

---

# SECTION 1 — FILE STRUCTURE (40 reference files)

Before building, arrange this exact folder. Claude reads from here.

```
HomzList/
├── designs/                          ← 13 design HTML files
│   ├── P1 - Auth & Entry.html
│   ├── P2 - Feed + Stories + Global Shells.html
│   ├── P3 - Search  Explore.html
│   ├── P4 - Detail Screens.html
│   ├── P5 - Creation A (Plan wall + Form + Photos).html
│   ├── P6 - Creation B (Preview + Payment + Forms + Drafts).html
│   ├── P7 - Messages + Chat.html
│   ├── P8 - Visits, Leads, Requirements, Proposals.html
│   ├── P9 - Profile suite.html
│   ├── P10 - Saved, Activity, Settings suite.html
│   ├── P11 - Plans, Payments, Boost, Notifications.html
│   ├── P12 - Help, Legal, Blog, System pages + Components Gallery.html
│   └── P13-14-15 - ADMIN DASH FULL.html
│
├── design-prompts/                   ← 15 prompt txt files (p1–p15)
│
├── docs/                             ← spec docs (context)
│   ├── Doc1 - Design Foundation.md
│   ├── Doc2 - SRS User.md
│   ├── Doc3 - SRS Admin System.md
│   ├── Doc4 - Screen Specs User.md
│   └── Doc5 - Screen Specs Admin.md
│
├── build/                            ← build docs (this + others)
│   ├── Doc6 - Build Guide.md
│   ├── Doc7 - API List.md
│   ├── Doc8 - Architecture.md
│   ├── Doc9 - Security Audit.md
│   └── Doc10 - Legal Pages.md
│
├── CLAUDE.md                         ← project brain (Section 2)
└── RULES.md                          ← PART A-E master instruction
```

**The actual code project** (that Claude generates) lives separately:

```
homzlist-app/                         ← the real Next.js codebase
├── app/
│   ├── (public)/                     → homzlist.com routes
│   ├── (seller)/                     → seller.homzlist.com routes
│   ├── (admin)/                      → account.homzlist.com routes
│   └── api/                          → backend endpoints
├── components/                       → shared UI (design system)
├── lib/                              → utils, supabase client, providers
├── skills/                           → Claude skill files (Section 3)
├── middleware.ts                     → subdomain routing
├── .env.local                        → secrets (never committed)
└── ...
```

---

# SECTION 2 — CLAUDE.md (project brain — keep under 200 lines)

Create this file at the root of `homzlist-app/`. It loads into every Claude Code session automatically. Keep it lean — detailed knowledge lives in Skills (loaded on demand).

```markdown
# HomzList — Project Brain

## What this is
Instagram-style real estate listing PWA. Photos + text only. No video/reels/follow/map/comments/user-stories.
Roles: Guest, Owner, Broker, Builder (+ Admin/Staff on separate subdomain).

## Stack (never swap without asking)
- Next.js (App Router) + TypeScript
- Supabase (Postgres + Auth-data + Realtime) — RLS MANDATORY on every table
- Cloudflare R2 (images + CDN)
- Redis + BullMQ (cache + queues)
- Tailwind CSS (tokens from Doc 1 only)
- Razorpay (payments), FCM (push), Resend (email)
- OTP: DEV MODE now (fixed code, no SMS) → MSG91+DLT later via provider layer

## Subdomains (one codebase, middleware routing)
- homzlist.com → public: feed, search, detail, area pages, blog, legal (SSR, SEO)
- seller.homzlist.com → Owner/Broker/Builder: create, chat, leads, profile, plans
- account.homzlist.com → Admin/Staff only (Google auth, fully isolated)

## Absolute rules
1. DESIGN IS FINAL. Implement designs/ pixel-exact. Never redesign/improve/rearrange.
   Mobile design = 0% change. Every popup/sheet/toast/dialog/notification kept as-is, only wired.
2. Desktop/tablet = SEPARATE native layouts (user-side only), built from mobile design without altering it. Admin already 3-device ready — don't touch its layouts.
3. Backend-driven only. No business data/flags in frontend or localStorage.
   Paid-status, numbers, locked content, roles — server-decided every request.
4. Server-side validation + authorization on EVERY endpoint. Browser never trusted.
5. No secrets in code. Env vars only. Never expose Supabase service_role key to client.
6. Bottom nav = P3's version, canonical, fixed on every screen that has it, no overflow beneath.
7. One font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif.
8. user-select: none on UI chrome (not on readable content like descriptions).
9. Instagram-smooth: 60fps, transform/opacity animations only, no layout jank.
10. Every action has loading/empty/error/offline states. No dead buttons, no dead-ends.
11. Premium Instagram-level polish is the quality bar — first impression = last impression. Every screen must feel premium, never cheap/templated.

## Design tokens
See skills/design-system. Accent #0F9D58 (dark #1DB868). Never hardcode hex — use tokens.

## Where things are
- Visual truth: designs/*.html  |  Feature rules: docs/Doc2, Doc3
- Screen specs+flows: docs/Doc4 (user), Doc5 (admin)
- APIs: build/Doc7  |  Architecture: build/Doc8  |  Security: build/Doc9

## Build discipline
- Read the relevant skill + spec section BEFORE coding a module.
- Plan mode for complex modules. /clear between unrelated modules.
- After each module: run the security + QA checklist (skills/qa-checklist).
- Never touch production DB directly. Migrations staged, human-run.
```

---

# SECTION 3 — TOKEN-EFFICIENT SETUP (Skills + Sub-agents + Hooks)

To build the whole SaaS cheaply without losing quality, offload knowledge into **Skills** (load on demand) and verbose work into **sub-agents**. This is the "Claude as a company" pattern.

## 3.1 Skills to create (in `skills/`)
Each skill = a focused markdown file Claude loads only when relevant:

- **`design-system`** — Doc 1 condensed: tokens, components, motion, badges, states, aspect ratios. Loaded when building any UI.
- **`security-rules`** — Doc 9 condensed: RLS, authz, injection, bypass-sealing, secrets. Loaded on every backend/auth module + review.
- **`api-contract`** — Doc 7 condensed: endpoint shapes, error format, websocket events. Loaded on backend work.
- **`listing-module`**, **`chat-module`**, **`payments-module`**, **`requirements-module`**, **`admin-module`** — per-domain rules from Doc 2/3. Loaded per module.
- **`qa-checklist`** — the self-test list (Section 8). Loaded after each module.
- **`design-to-code`** — how to convert a design HTML section into React+Tailwind faithfully (Section 5 rules). Loaded whenever implementing a screen.

## 3.2 Sub-agents (role-based, keep verbose output out of main context)
- **security-auditor** — runs after each module: checks RLS, authz, secrets, injection, bypass. Returns short pass/fail + fixes.
- **qa-tester** — runs the QA checklist in preview, returns short report.
- **db-migrator** — writes migrations, never applies to prod (staged only).
Use **Sonnet** for most modules, **Opus** only for architecture/payment/security reasoning, **Haiku** for small sub-agent tasks.

## 3.3 Hooks
- Filter test/lint output to show only failures (saves tokens).
- Grep for secrets (`sk-|service_role|eyJ|apikey|Bearer`) after each module; block if found.

## 3.4 Session discipline
- `/clear` between unrelated modules. `/compact` focusing on "current module code + API contract" when long.
- Plan mode (Shift+Tab) before complex modules — approve approach, then code.
- Specific prompts only (module prompts below are pre-written specific).

---

# SECTION 4 — SUBDOMAIN ROUTING (one project, three subdomains)

`middleware.ts` detects the host and routes to the right route-group. Sessions/cookies are scoped per subdomain (security isolation).

**Rules:**
- `homzlist.com` (+ `www`) → `(public)` group. Fully SSR, SEO-first, guest-viewable. Feed, search, property/project/requirement detail, area/landing pages, blog, legal, sitemap, robots.
- `seller.homzlist.com` → `(seller)` group. Requires seller session (Owner/Broker/Builder). Create listing, photos, requirement/project forms, drafts, chat/messages, leads, visits, profile, plans/payments/boost, settings, notifications. Guest hitting this → redirect to login.
- `account.homzlist.com` → `(admin)` group. Requires admin Google session (whitelist). Fully isolated cookies. All admin screens.

**Redirect logic:**
- Guest browses `homzlist.com` freely. Any gated action (save/inquiry/chat/post) → login → after login, **role-checked**: seller-roles land on `seller.homzlist.com` dashboard; but public browsing stays available on `homzlist.com` (SEO + logged-in users can browse there too).
- Already-logged-in user hitting `/login` (any subdomain) → **redirect to their home**, never show login again. (This seals the login-bypass example you gave.)
- Admin session never valid on seller/public and vice-versa (separate cookie scope + separate Supabase auth context).

**Bypass sealing at routing layer (from Doc 9, enforced here):**
- Every protected route checks session server-side (SSR) before rendering — no client-side-only guards, no data flash.
- Listing-state access matrix enforced server-side: draft/pending/rejected/changes → owner+admin only (else 404); hidden/archived → owner+admin; deleted → 404; live → public.
- Locked-requirement data, private numbers, paid content: stripped server-side, never in the API payload before entitlement.
- Deep links auth-checked on the server; guessing a URL cannot bypass anything.

---

# SECTION 5 — DESIGN-TO-CODE RULES (how designs become the app)

This is the most important section for preserving your design. Claude follows these when turning any `designs/*.html` screen into React+Tailwind.

## 5.1 Fidelity (mobile)
- Reproduce the mobile design **exactly**: same layout, spacing, sizing, colors, radii, shadows, typography, component structure, hierarchy. Pull values from Doc 1 tokens (don't eyeball).
- Every element in the design is present in code — nothing added, removed, or moved.
- Every popup, bottom-sheet, dialog, toast, alert, notification, coach-mark, empty/loading/error/offline state shown in the design is implemented with the **same appearance and position**. Only their **behavior** is wired (open/close, data, actions).
- Icons: keep the same inline SVG outline set (Lucide-style, 1.5px). No swaps to other icon styles.
- Font: the one system stack. If any design file used a different font anywhere, normalize to this stack (this was checked — base stack is already consistent; enforce globally via one Tailwind base rule).

## 5.2 Behavior wiring (make it real)
- Replace the design's mock JS (fake data, fake navigation, in-memory state) with **real data from the backend** (Supabase queries / API routes).
- Every button/link/tab/sheet/toggle actually works and routes correctly. No dead UI, no placeholder screens — placeholders in designs ("Feed — Batch P2") are replaced by the real target.
- Loading: every async action shows the design's loading state (e.g., button spinner replacing label, width locked) until the server responds — even on slow networks the button stays in loading, never dead. (Your explicit rule.)
- Optimistic UI where Instagram does it (send message, like/save) with revert on failure.
- Smoothness: animations use transform/opacity only, 60fps; respect prefers-reduced-motion; iOS momentum scroll preserved; no layout shift.

## 5.3 Fixes to apply globally (from analysis report)
- **Bottom nav** = P3's canonical version. Same nav on every screen that has it, `position: fixed`, safe-area padding, nothing overflowing beneath it, no content hidden behind it.
- **Sheets/popups/dialogs**: content must never be clipped by `overflow:hidden`; scroll inside the sheet body (`overflow:auto`) while the sheet stays within its bounds; open/close fully responsive (X, backdrop, swipe-down, back — all work, no unresponsive states). Stacked sheets: back closes only the top one.
- **user-select: none** on UI chrome (nav, buttons, labels, chips, badges) so taps don't accidentally select text; readable content (descriptions, chat messages, article/legal text) stays selectable.
- **Any misalignment** seen in a design is corrected to proper alignment (this is a technical fix, not a redesign — spacing/tokens from Doc 1).
- **Design mismatches** (e.g., a desktop view accidentally showing a mobile device mockup inside admin tables, or a component showing the wrong device frame) are corrected to the intended content.

## 5.4 Desktop/Tablet native layouts (user-side only)
- For each user-side screen, after building the exact mobile layout, build a **separate desktop and tablet layout** as a distinct, native, full-width design — using the mobile design as the source of truth for content, components, colors, and behavior, but laid out properly for larger screens (multi-column, sidebars, wider content, proper use of space).
- The mobile design must remain **byte-for-byte unchanged** — desktop/tablet are additive breakpoints, never a stretched or centered mobile view.
- Breakpoints: mobile (base) / tablet (≥768px) / desktop (≥1024px). Do not invent extra breakpoints.
- **Admin (P13-14-15) is exempt** — it already ships mobile+tablet+desktop; implement it as given, no separate layout work, don't re-viewport it.

## 5.5 What Claude must ask (never assume)
If a design element is unclear, missing, or conflicts with a spec, Claude **stops and asks you** before inventing a version. (Your PART A rule.)

# DOC 6 — HOMZLIST BUILD GUIDE (Part 2)

---

# SECTION 6 — IMAGE PIPELINE (photos, brochures, crop, zoom)

Every image in HomzList flows through this exact pipeline. Built once as a reusable service, used by listings, projects, profile photos, banners.

## 6.1 Upload flow
1. User picks any image (JPG/PNG/HEIC/WebP), any size up to 25MB/file.
2. **Client-side**: resize to max 2000px longest edge (canvas), strip nothing yet, show upload progress (design's progress ring). Crop/rotate/brightness available in the editor sheet (P5 design) — crop suggests 4:5 for cover.
3. **Presigned direct upload** to Cloudflare R2 (browser → R2 directly, not through server — saves server load at scale).
4. **Server enqueues** a BullMQ job (never blocks the request).

## 6.2 Processing job (BullMQ worker)
For each uploaded original:
- **Compress + convert → WebP** (primary) + **JPEG fallback** (old browsers).
- Generate **4 variants**: `thumb` (grid 1:1 ~300px), `medium` (feed 4:5 ~800px), `large` (detail ~1600px), `original` (capped 2000px).
- **Strip EXIF/GPS** (privacy — no location leak).
- **Watermark**: "HomzList" + listing ID, subtle, bottom corner.
- Store all variants in R2 under a random public ID path; serve via Cloudflare CDN with cache headers + versioned URLs.
- **Quality**: "Balanced" default (good look, small size), **admin-editable** in Settings (you can raise/lower later).
- On failure: mark that photo failed → user sees the design's per-tile retry chip. Partial success allowed ("6 uploaded, 2 failed").
- **Orphan cleanup** cron: images uploaded but not attached to a submitted listing within 7 days are deleted.

## 6.3 Brochure (builder PDF)
- PDF up to 10MB, 1–2 files. **ClamAV virus scan** → if clean, **Ghostscript compress** → store in R2 (private, signed URL). Scanning/Ready states shown per design.

## 6.4 Zoom & viewing
- Detail page: fullscreen photo viewer with **pinch-zoom + double-tap zoom** (mobile) and click-zoom (desktop), swipe between photos, swipe-down to dismiss — exactly like other property sites, as in the P4 design. Right-click/long-press save blocked on images.
- Feed/grid: blur-up progressive loading (20px blurred → crossfade to full), lazy-load 200px before viewport, prefetch next 3–4 feed images.

## 6.5 Rules
- Owner/Broker max 10 photos, Builder unlimited (bulk). Min 1.
- Aspect ratios locked (Doc 1): feed 4:5, story 9:16, grid 1:1, avatar circle, detail natural. Cover-crop, never stretch — carousels never jump height.
- All image URLs are CDN URLs; no image bytes ever pass through the app server after upload.

---

# SECTION 7 — MODULE BUILD ORDER + READY-TO-PASTE PROMPTS

Build in this order (dependencies first). Each module: **read spec → plan → build → self-test → security-check → report → you verify → next.** Every prompt below is copy-paste ready into Claude Code. Each cites exact files so nothing is built from memory.

**Order:** 0 Foundation → 1 Auth → 2 Roles/Profiles → 3 Plans/Payments → 4 Listings → 5 Requirements/Proposals/Matching → 6 Feed/Stories → 7 Chat/Number → 8 Search/SEO → 9 Boost → 10 Notifications → 11 Admin → 12 Legal/CMS/Blog → 13 PWA/Polish → 14 Desktop-Tablet layouts → 15 Security pass → 16 Load-test → 17 Launch.

---

### MODULE 0 — FOUNDATION & DESIGN SYSTEM
```
Read: CLAUDE.md, RULES.md, docs/Doc1 (Design Foundation), build/Doc6 (Sections 1-6),
build/Doc7 (env + API contract), build/Doc8 (architecture), build/Doc9 (security).

Task: Scaffold the HomzList codebase.
1. Next.js (App Router) + TypeScript + Tailwind. Route groups: (public), (seller), (admin), api.
2. middleware.ts: subdomain routing per Doc6 Section 4 (homzlist.com / seller / account),
   session isolation per subdomain, already-logged-in → redirect away from /login.
3. Supabase client (server + browser), env from .env.local. NEVER expose service_role to client.
4. Tailwind config: encode ALL Doc1 tokens (colors light+dark, spacing 4/8/12/16/24/32,
   radius, shadows, the one font stack). No raw hex anywhere else.
5. Global CSS: user-select:none on UI chrome; readable content selectable; reduced-motion;
   iOS momentum scroll; 60fps base.
6. Build the shared component library from Doc1 + the designs (Button, Input, Chip, BottomSheet,
   Toast, Dialog, Card set, StatusBadge, VerifiedBadge, Avatar, Skeleton, EmptyState, ErrorState,
   BottomNav [P3 canonical, fixed], Header, etc.). Each: all 7 states (default/pressed/loading/
   disabled/active/selected/error) + focus. Dark mode via tokens.
7. Redis + BullMQ setup (queues: image, notifications, matching, email). Image pipeline service
   per Doc6 Section 6 (stub workers ok, wire fully in later modules).
8. PWA shell: manifest, service worker (offline page, cached feed), install prompts (Android card
   / iOS guide), app icon/splash/favicon (HomzList placeholder, admin-changeable).

Design fidelity: pull the shell/nav/components from designs/P2 and designs/P3 (bottom nav = P3).
Do NOT build screens yet — just the foundation + reusable components.

Then: run skills/qa-checklist + security-auditor sub-agent. Report what you built, what you
tested, any issue. Ask me before assuming anything unclear.
```

### MODULE 1 — AUTH & ENTRY (P1)
```
Read: designs/P1, design-prompts/p1, docs/Doc2 §3 (auth), docs/Doc4 (screens 1-8),
build/Doc7 (auth endpoints), build/Doc9 (auth security, session, bypass).

Build the auth module EXACTLY per designs/P1 (mobile pixel-exact, all screens/sheets/states):
Splash (+update/maintenance), Onboarding, Login (+rate-limited/number-locked/guest),
OTP (+countdown/wrong/exhausted/resend-limit/loading), Saved accounts, Role selection (+info
dialog), Basic details (+photo sheet, city sheet, 18+/privacy checks), Coach marks, Browser-
unsupported, Offline banner.

Backend/logic:
- Phone + OTP. OTP = DEV MODE now: no SMS; generate a code, log it server-side / show in a dev-only
  way; provider layer abstracted so MSG91+DLT drops in later via env (Doc7). Fixed test code allowed
  in dev.
- Rules from Doc2 §3: 3 verify attempts, 30s resend ×3, 10 fails/day → 24h lock, SMS rate limits,
  WebOTP autofill, honeypot, 18+ + DPDP consent (versioned log), recycled-SIM (12mo) handling,
  number-change dual-OTP, lost-number = support only.
- Session: 30-day refresh token (httpOnly, subdomain-scoped), 15-min access, rotation, invalidate
  on suspend/role-change. Already-logged-in hitting /login → redirect home.
- Registration → role selection → basic details → seller dashboard (seller subdomain) / feed.
- Server-side everything; generic responses (no number-enumeration leak); no secrets client-side.

Wire every button/sheet/state to real behavior; loading states hold on slow network. Then run
security-auditor + qa-tester. Report. Ask if anything unclear.
```

### MODULE 2 — ROLES & PROFILES (P9)
```
Read: designs/P9, design-prompts/p9, docs/Doc2 §11 (profiles) §2 (roles),
docs/Doc4 (screens 44-54), build/Doc7 (profile/verification endpoints), build/Doc9.

Build per designs/P9 exactly: Own profile (stats Listings/Views/Leads, verification badges,
featured, pinned, role-based grid tabs, grid/list, account-switch, view-as-visitor, QR menu),
Other profile (public only, no Views/Leads, suspended/deleted states), Edit profile (photo/crop,
bio auto-flag, city, number dual-OTP, builder/broker extras), Verification (Phone/ID/RERA levels,
doc upload, pending/approved/rejected/revoked), Listing stats (metrics, no-boost-analytics note,
performance nudge, still-available prompt), My listings manager (all statuses incl. changes-
requested with field-notes, rejected, hidden, sold, rented re-activate, archived).

Logic (Doc2): role change = admin-approval request; verification badges say "Phone/ID/RERA
verified" NEVER "property verified"; Views = unique/day self-excluded; response-time auto-calc;
bio number/URL auto-flag → admin queue. Backend-driven. RLS: users see only their own private data.
Run auditors. Report. Ask if unclear.
```

### MODULE 3 — PLANS, PAYMENTS, BOOST (P11 + P5 plan-wall + P6 checkout)
```
Read: designs/P11, designs/P5 (plan wall), designs/P6 (checkout/success),
design-prompts/p11/p5/p6, docs/Doc2 §4 (plans/payments), docs/Doc4 (55-60),
build/Doc7 (payment endpoints + Razorpay webhook), build/Doc9 (payment security).

Build per designs (exact): Plans/pricing (₹999/₹2,999/₹9,999 role-filtered, most-popular,
compare sheet, coupon), My plan dashboard (usage bars, pooled FIFO, consumed-trace, grace, trial,
reminders), Payment history + invoices (GST, statuses, retry, refunded), Boost purchase (eligible-
listing picker, duration, targeting, reach), Boost status (active/pending/expired/rejected/renew),
Top-up sheet (inline + auto-send), Checkout (Razorpay, GST, GSTIN, pending-UPI/failed/double-pay),
Success.

Logic (Doc2 §4): PAYMENT-FIRST (plan wall before form). Server verifies amount+currency+status
before activation; webhook HMAC + idempotency; no refunds except technical failure (atomic revoke);
requirement-quota rule (toggle-on-after-renewal consumes, off/delete still counted); trial admin-
only; grandfathering; coupons; slot state machine (reserved→released/consumed). Razorpay keys in
env only; never trust frontend amounts. RLS on all payment tables. Run auditors. Report. Ask.
```

### MODULE 4 — LISTINGS (P5 + P6 + P4 detail)
```
Read: designs/P5, designs/P6, designs/P4, design-prompts/p4/p5/p6,
docs/Doc2 §5 (listings) §6 (projects), docs/Doc4 (16-33), build/Doc7, build/Doc9.

Build per designs (exact): Post type, property type (role-filtered, Builder no PG), dynamic
listing form (all per-type fields via JSON config — Flat/Bungalow/Farmhouse/Commercial/Plot/Agri/
PG; Vigha/Guntha conversion; price comma+word+on-request+negotiable; location cascade 6 levels +
request-area; amenities; description number-detection; contact toggles; ownership proof optional),
Photos (cover, reorder, editor crop/rotate/brightness, retry, brochure scan), Preview, Requirement
form, Project form (RERA/units repeater/floor plans/banks), Drafts, Edit + status flows (sold/
rented/re-activate/restore/still-available), Property/Project/Requirement detail (all fields,
sticky bars per contact-mode, photo viewer zoom, similar, under-review/sold states, 404).

Logic (Doc2 §5-6): dynamic fields via config (new types without code); admin approval (Approve/
Request-changes-with-per-field-notes/Reject; 3-reject lock); lifecycle crons (2-month/1-year still-
available → hide → delete; 30-day trash); URL state-access matrix; image pipeline (Section 6);
warnings-only never block. Backend-driven; RLS owner-scoped; server-side field validation mirrors
client. Run auditors. Report. Ask.
```

### MODULE 5 — REQUIREMENTS, PROPOSALS, MATCHING (P8 + P2 req-mode)
```
Read: designs/P8, designs/P2 (requirement mode), design-prompts/p8/p2,
docs/Doc2 §7 (requirements) §8 (proposals/matching), docs/Doc4 (19,40-43), build/Doc7, build/Doc9.

Build per designs (exact): Requirements browse (locked/unlocked cards, paywall, cascade sections),
My requirements (toggle with quota-consume confirm, proposals count, matching strip, edit/fulfil/
delete double-confirm), Proposals received (auto-visible sender number, accept/decline/not-relevant),
My proposals sent (statuses, non-refund notes), Proposal sheet (2 options + listing picker +
duplicate guard + quota-exhausted inline top-up), Visits (schedule/reschedule/cancel/outcome),
Leads pipeline (stages, CSV export, trust info).

Logic (Doc2 §7-8): viewing others' requirements = paid (₹2,999); posting via quota; locked data
STRIPPED SERVER-SIDE (preview fields only — DevTools-proof); NUMBER RULE (poster sees sender's
number auto; sender must Request→Allow); matching cascade (exact landmark→adjacent→city, budget
±20%) powering matches + reverse-match + builder auto-notify; proposal counters atomic; quota rules.
Run auditors. Report. Ask.
```

### MODULE 6 — FEED & STORIES (P2 + P3 shells)
```
Read: designs/P2, design-prompts/p2, docs/Doc2 §9 (feed/stories), docs/Doc4 (9-11),
build/Doc7 (feed/story endpoints + realtime), build/Doc8 (feed performance), build/Doc9.

Build per designs/P2 (exact): Header (city chip, scroll-morph, badges), Bottom nav (P3 canonical),
Story row (auto-only, no add-story, ring types, edge-fade), Property-mode feed (3 card types,
carousel/dots/counter, promoted, double-tap heart, save), Requirement-mode feed (locked/unlocked/
boosted-locked), Builder dashboard feed (own stats + matched reqs, no foreign listings), Story
viewer (segments/auto-advance/tap-zones/hold/swipe/unavailable), all sheets (city/sort/⋯/inquiry/
share/report/paywall/proposal), pull-to-refresh, new-listings pill, caught-up, suggested strip,
admin banner slot, skeleton/empty/guest/offline.

Logic (Doc2 §9): ranking (boosted FIFO → cascade → recency); own listings excluded; stories auto-
generated from last-24h approved in user's city, cascade order no cap, 24h expiry (signed media
dies), no view counts to users; feed via cursor pagination, position restore, realtime "new
listings" pill (≥30s threshold, never auto-inject). Instagram-smooth 60fps. Backend-driven.
Run auditors. Report. Ask.
```

### MODULE 6B — SAVED, ACTIVITY & SETTINGS (P10)
```
ADDED 23 Jul 2026. P10 was the ONE design file with no module in this plan — its 12 screens
had no owner, while Module 6 already ships a real `saves` table and the canonical bottom nav
carries a Saved tab. Numbered 6B so Modules 7-17 (referenced across docs) keep their numbers.

Read: designs/P10, docs/Doc2 (saved/activity/settings), docs/Doc4, build/Doc7, build/Doc9.

Build per designs/P10 (exact): S1 Saved + collections (tabs with real counts, tiles, move/remove),
S2 Your Activity, S2b Saved searches, S3 QR & Share, S4 Trash (restore/purge), S5 Archived,
S6 Settings home + S6b Privacy, S7 Notification prefs, S8 Language, S9 Login activity,
S10 Blocked users.

Wiring: S1 reads the EXISTING `saves` table (Module 6) — do not re-model it. S7 reads/writes
`notification_prefs` (Module 3) and pairs with Module 10. S10 needs Module 7's block system
(A4). S4 pairs with the existing trash/restore work in Module 4. Backend-driven, RLS on every
new table. Run auditors. Report. Ask.
```

### MODULE 7 — CHAT, INQUIRY & NUMBER SYSTEM (P7)
```
Read: designs/P7, design-prompts/p7, docs/Doc2 §10 (chat/inquiry/numbers), docs/Doc4 (34-39),
build/Doc7 (chat endpoints + realtime), build/Doc9 (chat security, number sealing).

Build per designs/P7 (exact): Messages home (4 tabs: My Listings/My Inquiries/Requirement Leads/
My Responses, requests row verified/others, grouping, swipe/bulk, unread filter, 4 empty states),
Requests (preview-before-accept, trust strip, proposal-with-number variant), Chat thread (pinned
listing live-refresh, bubbles ticks/seen, reactions, swipe-reply, quoted-jump, photo, link-preview
caution, number-request→allow→NumberCard, visit scheduler, continuity prompt, system safety card,
number-pattern warning, quick replies, all 9 states), Chat details (shared media, block/report).

Logic (Doc2 §10): property inquiry FREE unlimited; inquiry = chat request, accept-before-seen,
decline 30-day cooldown; NUMBER RULE enforced (poster sees sender auto; sender Request→poster
Allow/Deny; numbers absent from payloads pre-allow — DevTools-proof); one thread per user-listing;
chats survive archive/expiry/deletion; admin read-only (never send). Realtime via Supabase.
Run auditors. Report. Ask.
```

### MODULE 8 — SEARCH & SEO (P3)
```
Read: designs/P3, design-prompts/p3, docs/Doc2 §12 (search), docs/Doc3 (SEO engine),
docs/Doc4 (12-15), build/Doc7 (search endpoints), build/Doc8 (search scale).

Build per designs/P3 (exact): Search home (recents, popular, explore grid 2×2, autocomplete
suggestions/pages/recent, long-press peek), Search results (5 tabs, count, sort, landing-suggestion,
cascade "Nearby", zero-results), Filter sheet (dynamic per-type fields, dual budget slider, nested
location sheet stacking, amenities, toggles, live count), Area page (breadcrumbs, H1, stats,
highlights, nearby, cross-links, FAQ — this doubles as SEO landing), City coming-soon.

SEO (Doc3 — GOD-LEVEL, top priority): programmatic landing pages (city×area×type×intent×BHK),
indexable only with 3+ listings, title/meta formulas, H1 = query, unique content blocks (rotating
templates), internal-link blocks (nearby + cross-links), schema (RealEstateListing/ItemList/
BreadcrumbList/FAQPage), separate sitemaps + index (sold auto-removed), robots.txt (admin/chat/
requirements/api disallowed), SSR all public pages, OG images, single-language indexed. All-Indian-
script Unicode search input. Backend search (Postgres indexed) now, Meilisearch-ready.
Run auditors. Report. Ask.
```

### MODULE 9 — BOOST (already in P11 — wire placement)
```
Read: designs/P11 (boost), docs/Doc2 §13 (boost), build/Doc7, build/Doc9.
Wire boost placement into feed/story/search (top slots, "Promoted" tag, location targeting),
admin-approval before live, no user analytics (status only), auto-stop on sold, refund on admin-
reject (atomic, webhook re-check race-sealed), renew-1-tap. Requirement-boost = locked-but-top for
unpaid. Backend-driven. Run auditors. Report.
```

### MODULE 10 — NOTIFICATIONS (P11 notif screen + system-wide)
```
Read: designs/P11 (notifications), docs/Doc2 §14, build/Doc7 (FCM), build/Doc9.
Build the notifications screen exactly (grouped Today/Week/Earlier, inline Allow/Deny on number
requests, inline still-available Yes/No, all 23 types, swipe-dismiss, unread, blocked-permission
banner). Channels: FCM push (iOS = installed-PWA), Resend email, WhatsApp later. Rules: grouping,
batch/channel dedup, quiet hours, per-category prefs (marketing separate — DPDP), 90-day purge.
Device/browser-aware notifications (Android/iOS/desktop). Run auditors. Report.
```

### MODULE 11 — ADMIN PANEL (P13-14-15)
```
Read: designs/P13-14-15 (single file, already 3-device — DO NOT re-viewport), design-prompts/
p13/p14/p15, docs/Doc3 (admin), docs/Doc5 (A1-A31 + flows), build/Doc7 (admin endpoints),
build/Doc9 (admin security — highest).

Build the admin panel EXACTLY per the admin design (implement its mobile+tablet+desktop as-is):
Login (Google-only, whitelist, unauthorized/revoked), Dashboard (pending tiles+SLA, stats+deltas,
anomalies, revenue chart, cron/backup strips), all queues (Listings/Requirements/Boosts/
Verifications/Appeals/Reports — risk-score, review detail with exact user-render + per-field notes +
3 actions + auto-advance + lock), Users list + User detail (deep-drill panels, all tabs, read-only
chats, suspend/role/impersonate-disabled-sends/adjust-balance/grant), Listings master (edit-with-
diffs + reason + re-review), Plans/Coupons/Grants, Finance (revenue/churn/reconciliation), Payments
list+detail (refund full-only + type-to-confirm), Master data (location tree + adjacency mapper +
JSON field-config editor + blocklist + number-regex + area-requests), CMS (pages+versioning+re-
acceptance, blog, FAQs, banners, broadcasts), Templates+strings, Settings & flags (features/
branding/rates/limits/retention-legal-locks/maintenance/system-actions), Tickets (+grievance SLA),
Disputes (Section-79 stance + evidence preserve), Staff (Google-only add + permission matrix),
Audit log, Cron & system, Analytics (funnel/events/stories/cities/definitions), Trash, Exports,
Impersonation.

Security (Doc9 — CRITICAL): account.homzlist.com fully isolated; Google-auth whitelist server-
checked; every admin action permission-checked server-side + audit-logged; admin chats READ-ONLY
enforced at API (no send even in impersonation); admin↔public sync (every setting/toggle/content
change reflects on public site correctly). Run auditors hard. Report. Ask.
```

### MODULE 12 — LEGAL, CMS PAGES, BLOG (P12 + Doc10)
```
Read: designs/P12, docs/Doc3 (legal), build/Doc10 (legal page content).
Build per designs/P12 (exact): Help/FAQ + article, Support tickets (+conditional fields, grievance
SLA), Legal readers (Terms/Privacy/Refund/Disclaimer/Community/Grievance/Cookie — content from
Doc10, CMS-driven, versioned, re-acceptance interstitial), Blog (list+post, SEO), Data download
(own data only), Deactivate/Delete (grace, payment-hold, type-to-confirm), Offline, Maintenance,
Components gallery. All legal content from Doc10 (detailed, Section-79, Rajkot jurisdiction, DPDP).
Guest-accessible + SEO. Admin-editable via CMS. Run auditors. Report.
```

### MODULE 13 — PWA, SMOOTHNESS & POLISH
```
Read: docs/Doc3 (PWA/perf), build/Doc8 (performance).
Finalize: service worker (offline queue + retry), install prompts, app shortcuts, icon badges,
update toast, back-button closes sheets. Instagram-level smoothness pass: 60fps everywhere, no
jank on scroll/swipe/open/close, blur-up images, prefetch, position restore, keyboard-aware chat,
no accidental text-select on chrome, no layout shift. Fix any misalignment/unresponsive popup found.
Run qa-tester across all screens. Report.
```

### MODULE 14 — DESKTOP & TABLET NATIVE LAYOUTS (user-side)
```
Read: build/Doc6 §5.4, all user designs/P1-P12.
For every user-side screen, build separate NATIVE desktop (≥1024) + tablet (≥768) layouts using the
mobile design as source of truth — proper full-width layouts (multi-column, sidebars, wider content),
NOT centered/stretched mobile. Mobile design stays 0% changed. Admin exempt (already done).
Verify every screen on mobile/tablet/desktop matches intent, no clipping/overflow/mismatch.
Run qa-tester per breakpoint. Report.
```

### MODULE 15 — SECURITY PASS (whole codebase)
```
Read: build/Doc9 (full).
Run the complete security audit over the entire codebase (RLS every table, authz every endpoint,
IDOR, injection, XSS/CSRF/SSRF, payment, bypass-sealing, secrets grep, headers, OWASP Top 10 + API
Top 10, the vibe-coding checklist + 30-min live audit). Fix every finding. Produce a report with
severity/PoC/repro/fix per Doc9 format. No CAPTCHA (use lockout/rate-limit/honeypot).
```

### MODULE 16 — LOAD TESTING (scale)
```
Read: build/Doc8 (architecture + load testing).
Set up k6/Artillery scripts simulating high concurrency. Verify queues/rate-limits/caching/DB
pooling hold under load; site stays smooth (no block, no render stall) even at extreme concurrency.
Report results + bottlenecks + fixes.
```

### MODULE 17 — LAUNCH
```
Read: build/Doc8 (launch ops), Doc3 (launch checklist).
Final: env config verify, backups + restore drill, sitemaps, Search Console, analytics events wired,
2 super admins, MSG91+DLT swap-in when keys provided, smoke-test critical paths on real accounts,
error-rate watch. Go live.
```

# DOC 6 — HOMZLIST BUILD GUIDE (Part 3)

---

# SECTION 8 — QA & TESTING PER MODULE (PART B — mandatory)

After **every** module, before moving on, Claude runs this in preview/live mode and fixes anything broken. No module is "done" until this passes. (This is your PART B, made concrete.)

## 8.1 Per-module test checklist (qa-tester sub-agent)
- **Every breakpoint** (mobile / tablet / desktop) matches the intended design. Mobile = the given design exactly; tablet/desktop = the native layout (user-side); admin = its own 3-device design.
- **No text clip / 2-line wrap breaking layout / overflow-hidden cut-off / cut text.**
- **No element hidden, missing, or overlapping.**
- **Every button/link/tab/sheet/toggle actually works** — no dead UI, no dead button, no placeholder left.
- **Full flow runs** — no stop, no dead-end; user can complete the journey.
- **Loading / empty / error / offline states** all present and correct; loading holds on slow network (button stays in loading, never dead).
- **No horizontal scroll / unintended overflow** anywhere.
- **No console errors.**
- **Popups/sheets/dialogs/notifications**: open + close fully responsive (X, backdrop, swipe-down, back), content not clipped, stacked sheets close top-first.
- **Bottom nav** fixed, present on every screen that has it, nothing overflowing beneath, content not hidden behind it.
- **No accidental text-selection** on UI chrome; readable content still selectable.
- **Smoothness**: scroll/swipe/open/close at 60fps, no jank, no layout shift.

## 8.2 Report format (short, after each module)
Claude returns: **what was checked · what was fixed · what still has an issue (if any) · confirmation the module matches the design.** Keep it short (token-efficient). Verbose logs stay in the sub-agent.

## 8.3 Runtime security spot-check (per module — from vibe-coding checklist)
- `curl` each new protected route unauthenticated → must return 401/403 (not data).
- Change an ID in a URL/request (`/property/123` → `/124`, another user's chat/lead/payment) → must be blocked (IDOR test).
- Grep the built client bundle for secrets (`sk-`, `service_role`, `eyJ`, `apikey`, `Bearer`, env prefixes) → must be empty.
- Check no session token/business data in localStorage → refresh token must be httpOnly cookie only.
- Inject `<script>` / SQL-ish strings in inputs (search, forms, chat) → must be sanitized, no execution.

## 8.4 Four-phase discipline (Autonoma pattern, applied per module)
1. **Before building**: define failure cases + "done" meaning in the plan (plan mode).
2. **After building**: test unhappy paths, auth on every route, secrets grep, static analysis (ESLint/Semgrep), injection tests.
3. **Before moving on**: smoke-test critical paths, env config, DB writes reversible/transactional.
4. **After integrating**: watch error logs, run full flow on a fresh account.


## 8.5 Automated browser testing (Playwright) — mandatory per module
- Write Playwright tests that open the real app in a headless browser, enter test data,
  click through every flow, and assert the result (like a human testing live).
- Take screenshots at each breakpoint (mobile/tablet/desktop) and visually verify
  against the design.
- Test happy + unhappy paths end-to-end (login→feed→listing→chat→payment etc.).
- These run after each module + before launch. Claude fixes anything that fails.
---

# SECTION 9 — FEATURE-TOGGLE (C) + ERROR-HANDLING (D) + AI-SECURITY (E)

## 9.1 Feature toggles (PART C — no gaps when off)
- Every feature that admin can turn off (stories, boost, requirements, PWA prompt, blog, featured, etc.) is gated by a server-provided flag (admin Settings → Feature flags).
- When a feature/button/section is OFF: **it cleanly auto-hides; layout auto-adjusts; NO empty gap, no broken space.** Components render nothing (not an empty box) and siblings reflow.
- Flags are fetched server-side (SSR) so there's no flash of a feature that's off.
- Admin↔public sync: flipping a flag/branding/content/plan/price/master-data in admin reflects correctly on the public + seller sites (cache purge where needed).

## 9.2 Error handling (PART D — clean to user, detailed to logs)
- **Users never see technical errors.** Every failure shows a clean, friendly message or a graceful fallback (design's error state / toast).
- **Actual error detail** (stack, code, context) captured server-side (structured logs + Sentry), never sent to the browser. Production `debug=false`; generic messages only.
- Structured error contract `{ code, message_key }` — frontend shows the translated friendly message; the code/detail stays server-side.
- Network/offline: actions queue with the design's offline state + auto-retry on reconnect + success toast. Nothing looks "dead."

## 9.3 AI-feature security (PART E)
*(HomzList's user-facing surface has no open AI chat, but these apply to any AI/automation used, e.g., admin tooling, and are enforced generally.)*
- **Prompt-injection / jailbreak**: any AI feature treats user content as data, never as instructions; user input can't override system instructions; outputs validated before use.
- **Access control on routes**: no URL guessing bypasses a restricted page (server-side auth on every route — already in Doc9/§4).
- **Input validation**: empty / very long / weird characters / special symbols / unicode — all handled gracefully everywhere (search, forms, chat, filters). Max lengths enforced server-side.

---

# SECTION 10 — ASSEMBLY, DNS & DEPLOY

## 10.1 Bringing modules together
- All modules live in one Next.js codebase; the shared component library (Module 0) guarantees visual consistency, so modules already fit together.
- Cross-links that were placeholders in designs are wired to real routes (Module target).
- Final integration pass: click through every entry→exit→back→deep-link→notification-landing chain from Doc4/Doc5 and confirm it lands correctly.

## 10.2 Subdomain DNS
- `homzlist.com`, `www`, `seller.homzlist.com`, `account.homzlist.com` → all point (CNAME/A) to the same deployment behind Cloudflare.
- Cloudflare: SSL (full/strict → A grade), CDN for static + R2 images, WAF/DDoS on, security headers at edge (CSP, HSTS, X-Frame-Options — B+ grade minimum).
- Middleware routes by host (Section 4). Cookies scoped per subdomain (isolation).

## 10.3 Environments & deploy
- 3 environments: local / staging / production. Secrets per environment (never in code).
- CI: build → tests (critical paths: auth, payments, authz, state transitions) → zero-downtime deploy → rollback script ready.
- Migrations staged and human-run (Claude never writes prod DB directly).
- Feature flags allow 10% rollouts. Maintenance mode with admin bypass.
- Seed data script (Rajkot founding listings) for launch.

---

# SECTION 11 — ENVIRONMENT VARIABLES (full list, secrets only in env)

```
# App
NEXT_PUBLIC_APP_URL=https://homzlist.com
SELLER_URL=https://seller.homzlist.com
ADMIN_URL=https://account.homzlist.com
NODE_ENV=production

# Supabase (use @supabase/ssr package — NOT deprecated auth-helpers)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # public (also called "publishable key" in newer dashboards); RLS protects data
SUPABASE_SERVICE_ROLE_KEY=...            # SERVER ONLY — never sent to client

# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_CDN_URL=...

# Redis
REDIS_URL=...

# Razorpay
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...                  # server only
RAZORPAY_WEBHOOK_SECRET=...              # server only

# OTP provider (abstraction layer)
OTP_PROVIDER=dev                         # dev now; "msg91" at launch
OTP_DEV_FIXED_CODE=123456                # dev only
MSG91_AUTH_KEY=...                       # added at launch
MSG91_SENDER_ID=...
MSG91_DLT_TEMPLATE_ID=...

# Email (Resend, via Supabase SMTP too)
RESEND_API_KEY=...
EMAIL_FROM=noreply@homzlist.com

# FCM (push — HTTP v1)
FCM_PROJECT_ID=homzlist-app
FCM_SERVICE_ACCOUNT_JSON=...             # server only — full service-account JSON content
NEXT_PUBLIC_FCM_VAPID_KEY=...            # from Web Push certificates
NEXT_PUBLIC_FCM_SENDER_ID=287242175178

# Google OAuth (admin — via Supabase)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...           # server only

# Security / misc
JWT_ACCESS_SECRET=...                    # server only
JWT_REFRESH_SECRET=...                   # server only
SENTRY_DSN=...
```

**Rules:** anything without `NEXT_PUBLIC_` is server-only. Service-role, secrets, webhook secrets NEVER reach the browser. After each module, grep the client bundle to confirm none leaked.

---

# SECTION 12 — DEFINITION OF DONE (per module) + FINAL

A module is DONE only when ALL are true:
- ✅ Matches the given design exactly (mobile pixel-exact; tablet/desktop native for user-side; admin as-is).
- ✅ Every screen, sheet, popup, dialog, toast, notification, and all 5 states (loading/content/empty/error/offline) present and working.
- ✅ Every button/flow works; no dead UI, no dead-end, no placeholder.
- ✅ Backend-driven; no business data/flags in frontend/localStorage.
- ✅ Server-side validation + authorization on every endpoint; RLS on every table.
- ✅ Bypass-sealed (auth on routes, IDOR-safe, locked data/numbers stripped server-side).
- ✅ No secrets in client bundle.
- ✅ Feature-toggle safe (off = clean auto-hide, no gap).
- ✅ Errors clean to user, detailed to logs.
- ✅ Loading holds on slow net; 60fps smooth; no jank/overflow/misalignment; nav fixed; no accidental text-select on chrome.
- ✅ qa-tester + security-auditor passed; short report delivered; you verified.

**Final (whole SaaS) DONE:**
- ✅ All 17 modules done.
- ✅ Full security pass (Doc9) — every finding fixed.
- ✅ Load test (Doc8) — smooth at extreme concurrency.
- ✅ Legal pages live (Doc10). Grievance officer published. SEO landing pages + sitemaps live.
- ✅ Backups + restore drill done. 2 super admins. Analytics events firing.
- ✅ Admin↔public sync verified. Subdomains + SSL + WAF live.
- ✅ MSG91+DLT swapped in when keys ready (OTP was dev-mode during build).

---

# SECTION 13 — QUICK REFERENCE: which files feed which module

| Module | Designs | Prompts | Spec docs |
|---|---|---|---|
| 0 Foundation | P2, P3 (shells) | p2, p3 | Doc1, Doc6, Doc7, Doc8, Doc9 |
| 1 Auth | P1 | p1 | Doc2 §3, Doc4 (1-8), Doc9 |
| 2 Profiles | P9 | p9 | Doc2 §11/§2, Doc4 (44-54) |
| 3 Plans/Pay/Boost | P11, P5, P6 | p11, p5, p6 | Doc2 §4, Doc4 (55-60), Doc7, Doc9 |
| 4 Listings | P5, P6, P4 | p4, p5, p6 | Doc2 §5-6, Doc4 (16-33) |
| 5 Requirements | P8, P2 | p8, p2 | Doc2 §7-8, Doc4 (19,40-43) |
| 6 Feed/Stories | P2 | p2 | Doc2 §9, Doc4 (9-11) |
| 7 Chat/Number | P7 | p7 | Doc2 §10, Doc4 (34-39) |
| 8 Search/SEO | P3 | p3 | Doc2 §12, Doc3 (SEO), Doc4 (12-15) |
| 9 Boost placement | P11 | p11 | Doc2 §13 |
| 10 Notifications | P11 | p11 | Doc2 §14 |
| 11 Admin | P13-14-15 | p13-15 | Doc3, Doc5 (A1-A31) |
| 12 Legal/CMS/Blog | P12 | p12 | Doc3, Doc10 |
| 13 PWA/Polish | all | — | Doc3, Doc8 |
| 14 Desktop/Tablet | P1-P12 | — | Doc6 §5.4 |
| 15 Security | — | — | Doc9 |
| 16 Load test | — | — | Doc8 |
| 17 Launch | — | — | Doc8, Doc3 |

---


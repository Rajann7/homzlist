# DOC 3 — HOMZLIST MASTER SRS (PART B: ADMIN, SYSTEM, SECURITY, SEO, ARCHITECTURE, LAUNCH)

*Companion to Doc 2. Everything platform-side: admin panel, trust/safety/legal, security, SEO engine, technical architecture, operations. Nothing user-facing is redefined here — Doc 2 governs that.*

---

# 1. ADMIN PANEL

## 1.1 Access & Structure
- URL: admin.homzlist.com (separate subdomain; isolated sessions/cookies; security headers; IP-attempt alerting).
- **Login: Google Authentication ONLY** — no email/password, no OTP. Whitelist: only super-admin-added emails pass (Gmail/Google-linked required; validated at add-time). Remove email = access revoked + sessions invalidated instantly. Minimum 2 super admins always (separate Google accounts; recovery = surviving super adds new). Login audit (who/when/IP/device); unknown-email attempts logged; 5+ attempts → super-admin alert. 30-min session timeout; 2h idle heartbeat warning → auto-logout; online/offline staff status visible to super.
- **Roles & permission matrix**: **Staff** = approval queues + support tickets only · **Admin** = + user/listing edit, coupons, reports, refunds, master data · **Super Admin** = + plans/pricing, staff management, feature flags, audit logs, evidence SOP, branding, exports oversight. Every action permission-checked SERVER-side (not UI-hidden only).
- Desktop-first (sidebar 240px collapsible) + fully mobile-responsive (approval queue especially — night approvals from phone).

## 1.2 Dashboard (landing)
Pending-count tiles (listings/requirements/boosts/verifications/reports/tickets/appeals — tap→queue) · today stats (signups, revenue, listings, inquiries) **with prior-period comparison** (+12% vs last week) · anomaly banners (payment-failure spike, OTP spike, report spike) · in-panel notification bell (new items/flags feed) · SLA timers (queue items >24h = red) · cron status link · backup status indicator · revenue mini-graph · staff-online strip.

## 1.3 Deep-Drill Principle (global admin UX — user's core requirement)
Everything wired, popup/side-panel based: Users → user → full side panel (profile, plans timeline, payments, listings, leads by property/project/requirement, chats, communication log, notes, activity timeline) → any listing → full edit → its leads → any chat → other participant's profile → onward, infinitely. Every entity clickable to every related entity. Per-entity chronological timeline (created → approved by X → edited → reported → resolved). Hover/long-press quick-stat mini-cards. Global search: phone / name / listing ID / **payment ID / order ID**.

## 1.4 Review Queues (listings / requirements / edits / boosts / verifications / appeals / reports)
- **Risk-score priority (logic-based, NO AI)**: new account +2, prior reject +2, number-pattern flag +3, reported +3 → sorted high-first + red mark.
- Queue mechanics: item lock ("X is reviewing" + auto-skip for others), keyboard shortcuts (A=approve/R=reject) + auto-advance mode, saved filter views ("Rajkot pending flats"), bulk actions (max 20 + count-confirm), SLA timers, pending-payment listings section (visibility of stuck pipeline).
- **Review detail screen**: exact user-identical render (same components; card + detail toggle) · submitted fields panel · ownership-doc viewer side-by-side with fields · new-account profile shown alongside first listing · report-context flag if reported · prior-history strip (past rejects/edits) · collapsible SOP checklist side-panel (guidelines at decision point).
- **Three actions**: **Approve** (live + story + notify + SEO ping) · **Request Changes** (per-field notes — user sees notes at exact fields; stays pending; NOT counted to reject-lock) · **Reject** (template reasons + optional field notes; 3 rejects = lock → appeals queue reopens; 60-day idle rejected → auto-archive).
- Verification queue: doc viewer, approve → badge; revoke (with notification) anytime. Appeals queue: auto-flag false-positives + reject-lock reopens. Reports queue: structured reasons, entity preview, actions (dismiss/hide/warn/suspend/ban), reporter-outcome auto-notification.

## 1.5 User Management
Edit any field · suspend/lift (state machine per Doc 2 §3.3) · soft-delete · direct role change (logged) · grant trial (contents/duration; logged; user notified) · adjust balances (+proposals/restore slot; reason + log) · send individual notification/email · **impersonate** (logged; user-app shell with admin banner; ALL sends disabled — chat read-only enforced globally for admins) · merge-accounts SOP · deceased-user SOP · device/IP ban tool · velocity-rule flags review.

## 1.6 Content, Master Data & Config (all admin-editable — zero code deploys)
- **Location tree**: state→district→taluka→city/village→area/landmark CRUD + **adjacency mapper** (fuels cascade) + pincodes + bilingual names + area-highlights text (manual, no AI) + area-request queue (user requests → add → requester notified).
- Amenities list · blocklist words (multi-script) · number-detection regex editor · property-type field-config (JSON editor — new types/fields) · story-remove tool.
- **CMS**: pages (About/T&C/Privacy/Refund/Disclaimer), blogs, FAQs/Help center, banners (schedule + city target), broadcast announcements (city + role + plan-status segments).
- **Templates**: email/SMS/WhatsApp/push editors + test-send · **language-strings editor** (all UI translations).
- **Settings**: feature on/off switches (stories/boost/requirements/PWA prompt/…) · branding (logo/app name/primary color/favicon/OG default — HomzList placeholder, changeable) · retention configs (notifications 90d/OTP 30d/archived chats 12mo) · velocity rules · rate-limit table · maintenance toggle (admin bypass + test-mode) · boost rates + per-city caps · launch-city config (default: all ON) · CDN purge + sitemap regenerate buttons.

## 1.7 Plans, Finance & Payments
Plans A-Z editor (price/contents/features per role; grandfathering automatic) · coupons CRUD (rules + applies-to) · trials & grants log · **Finance**: revenue graphs (daily/monthly; split by plan/boost/top-up) · churn view (expiring plans + renewed?) · reconciliation (Razorpay auto-match + mismatch flags + manual per-transaction re-check) · GST/CSV exports · **Payments**: list + detail, refund UI (amount + reason → Razorpay API + user notification + atomic revoke), abandoned checkouts + send-retry-link, chargeback flags (auto plan-suspend), invoice resend/regenerate.

## 1.8 Support, Safety & Oversight
Tickets (open/replied/closed; staff assignment; internal comments; canned responses; SLA; categories incl. refund-request + number-recovery flows) · **Disputes module** (structured: parties + listing/chat links + resolution note + outcome; standard stance: no transaction liability) · grievance-officer workflow (auto-ack 24h + ticket number; 15-day resolution tracking) · police/court evidence SOP (super-only; logged; preservation) · staff performance (approvals/tickets per day) · **audit trail** (EVERY admin action; old→new diffs; 180-day+ retention; export actions audited + monthly export report to super) · trash browser (all soft-deleted + restore) · exports center · analytics dashboard (funnels signup→plan→listing→lead; events explorer; story aggregates; city breakdowns; metric definitions pinned) · admin manual listing on-behalf (tech-uncomfortable brokers) · test-flag on entities · concurrency indicators everywhere.

# 2. TRUST, SAFETY & LEGAL

## 2.1 Trust & Safety
Report system (structured reasons: Fake/Sold/Wrong price/Wrong photos/Abusive/Duplicate; per-message reports in chat; profile reports) · block (instant; independent of report) · watermarking (clone-traceable) · device fingerprinting (banned-user return detection) · honeypot anti-bot · anti-scraping (rate limits; 404-spike enumeration block; auth-gated APIs; random public IDs; image download-block) · profanity/number-pattern auto-flag queues · velocity flags · repeat-offender device/IP bans.

## 2.2 IT Act Section 79 Safe Harbour (framework — lawyer-reviewed before launch)
- T&C intermediary declaration: platform doesn't own/sell/verify title/guarantee any property; transactions solely between users.
- Prohibited-content user agreement + listing-submit truthfulness checkbox ("info true, legal right, photos mine").
- **Grievance Officer**: name/email/address published (footer + legal page); 24h acknowledgment + ticket number; 15-day resolution.
- Notice-and-takedown SOP: legal notice → immediate hide + super-admin escalation + evidence preservation.
- No editorial interference: admin edits = compliance-only (logged); never content "improvement".
- 180-day minimum log retention. Badge wording discipline: "Phone/ID/RERA verified" — NEVER "property verified/guaranteed" (in product OR marketing).
- T&C clauses: limitation of liability · no warranty on listings · user due-diligence duty (title search/site visit/legal verification) · token/advance off-platform = own risk · indemnity · **Rajkot jurisdiction** · arbitration · content ownership + platform display license · listing-transfer not allowed · no plan pause · fraud-deal dispute stance (remove listing + ban user; no transaction liability).
- Agriculture-land buyer-eligibility disclaimer (Gujarat) · RERA number mandatory on projects · platform's own RERA-registration question → lawyer (one-time review ₹10–15k budgeted) · GST registration planning.

## 2.3 DPDP Act
Consent checkboxes + versioned consent logs · T&C acceptance logs (version/timestamp) + re-acceptance on updates · data download (own profile/listings/OWN messages only/payments — JSON/CSV zip) · deletion flow (30-day grace; 7-day post-payment hold; financial records retained 7 years anonymized) · cookie consent banner · marketing-consent separate toggle · India data residency (Mumbai region) · minors excluded (18+ declaration).

# 3. SECURITY

## 3.1 Vibe-Coding Rules (Claude-build process security)
1. NO secrets in code/prompts ever (env vars only); post-module grep scan (`sk_live|key|secret|password`).
2. After every module, run review prompt: *"Review for: SQL injection, missing auth checks, IDOR, unvalidated input, exposed secrets, missing rate limits."*
3. Server-side validation EVERYWHERE (frontend = UX only) — stated in every build prompt.
4. Claude never touches production DB; migrations staged + human-run.
5. Dependency verification (typosquat check on every install; weekly `npm audit`).
6. Negative tests in Definition of Done (unauthorized access must FAIL; Claude writes these too).
7. Pre-launch: dedicated security-review session over full codebase + OWASP Top 10 manual pass.

## 3.2 Access Control & Bypass Sealing
Authorization matrix per endpoint (role × resource × action; ownership middleware — IDOR-proof) · mass-assignment field whitelists per endpoint · admin APIs server-role-checked · **paywall sealing**: locked-requirement data stripped SERVER-side (preview fields only — DevTools-proof) · numbers absent from all payloads pre-allow · deep-link auth on every protected route (SSR; zero data-flash) · listing-state URL matrix enforced server-side · paid-status server-checked per action (never client flags/localStorage) · story media signed URLs (24h expiry) · private docs signed URLs (owner+admin).

## 3.3 Application Security
Payment server-verification (amount/currency/status) before activation · webhook HMAC + guess-proof path · idempotency keys · CSRF tokens · XSS sanitization (all user content + chat render) · CSP + HSTS + X-Frame-Options headers · CORS locked to homzlist.com (never *) · file uploads: MIME magic-bytes + extension whitelist (last extension) + filename regeneration + no user-input paths + double-extension/path-traversal blocked + ClamAV on PDFs · per-endpoint rate-limit config (login tight/search medium/feed loose) + OTP account-locks · production error hygiene (generic user messages; details → Sentry only; debug=false in deploy checklist) · session invalidation on suspend/role-change · JWT rotation support (dual-secret window) · backup encryption at rest · enumeration/404-spike blocking · admin attempt alerting.

# 4. SEO ENGINE (Programmatic)

- **Landing-page matrix** auto-generated from master data: `/flats-for-sale-in-rajkot` · `/flats-for-sale-in-mavdi-rajkot` · `/2bhk-flats-for-rent-in-rajkot` · `/plots-for-sale-in-rajkot` · `/pg-in-rajkot` · `/commercial-shops-for-rent-in-rajkot` · `/new-projects-in-rajkot` — every city × area × type × intent × BHK combo. **Indexable only with ≥3 live listings** (else noindex until filled; zero-listing → noindex + requirement CTA).
- **Title formula**: `{Type} for {Sale|Rent} in {Area}, {City} - {count}+ Listings | HomzList` (≤60 chars; live count). Listing: `{BHK} {Type} for Sale in {Area}, {City} at {Price} | HomzList`.
- **Meta description**: `Find {count}+ verified {type} for {sale} in {area}, {city}. Prices from {min}. Photos, direct owner contact, no spam calls. Updated {Month Year}.` (155 chars).
- **Page anatomy**: H1 = exact query phrase → listings grid → unique content block (area highlights + auto price-range + BHK counts; 3–4 rotating template variations — no duplicate-content penalty) → internal-link blocks: Nearby areas (adjacency reuse) + cross-links (2BHK in Mavdi | Plots in Mavdi | Rent in Mavdi) → FAQ block (auto-answered from data) → breadcrumbs.
- **Schema**: BreadcrumbList · ItemList (landings) · RealEstateListing + priceValidUntil (listings; auto-updated on sold) · FAQPage.
- **URLs**: lowercase-hyphen; filter params = noindex,follow + canonical; pagination self-canonical + prev/next; slugs + random suffix (/property/rajkot-mavdi-3bhk-flat-x7k2).
- **Sitemaps**: separate (listings/landing-pages/areas/static) + index; sold auto-removed; auto-regenerate + admin manual button.
- **Freshness**: "Updated this week" + lastmod + cache purge on approvals. SSR all public pages. robots.txt: admin/chat/requirements/API disallowed. OG tags + auto-generated share image (cover + price + title bar). Single-language URLs (cookie language; English indexed; no hreflang). Search Console + Business Profile + review-us link. Reality note: 3–6 months to rank; seeding first.

# 5. TECHNICAL ARCHITECTURE

- **Stack**: SSR framework (Next.js/Nuxt) · monolith + Redis/BullMQ job queues (NO microservices) · WebSockets (Socket.io) for chat + notification badges + "New listings" pill ONLY · MySQL/Postgres + migration files (rollback plans; never manual ALTER) · DB indexed search at launch; Meilisearch = Phase 2.
- **Capacity**: 4GB VPS + managed DB + Cloudflare R2 ≈ ₹3–5k/month launch scale (anti-over-engineering note explicit).
- **Storage/media**: R2/S3 object storage · presigned direct uploads · CDN + versioned-URL invalidation · image pipeline (resize→WebP 4 variants→EXIF strip→watermark) in queue workers · orphan cleanup (7d) · brochure scan+compress · backups 30 daily + 12 monthly, encrypted, pre-launch restore drill.
- **Data integrity**: atomic counters (SELECT FOR UPDATE) · idempotency keys · slot/state machines (Doc 2) · soft-delete everywhere + cascade matrix (listings hide / chats anonymize-keep / payments never delete) · E.164 phones · UTC store + IST display · integer paise · cursor pagination · N+1 eager-loading rule · composite indexes (city+area+type+price+status+created; phone unique; thread+created) · random public IDs (sequential internal) · slug+suffix collision handling · defined races: toggle-vs-expiry (transaction validity check), boost-vs-reject (webhook re-check→refund), proposal-vs-OFF (refund), plan expiry = purchase-timestamp+period IST hourly cron · concurrent-edit soft locks (admin + user 2-device).
- **Conventions**: API /v1 versioning · API contract doc (~60 endpoints, request/response shapes) BEFORE build · structured errors `{code, message_key}` (frontend translates) · websocket event contract (message.new/seen, notification.new, request.accepted, listing.pill) · DB naming (snake_case; created_at/updated_at/deleted_at everywhere; FK conventions).
- **Ops**: 3 environments (local/staging/prod) · env-var secrets · CI zero-downtime deploys + rollback script · seed data script · critical-path tests (payments/OTP/authz/state transitions) · Razorpay test-mode checklist · 500-concurrent load test · Sentry · structured logs (user/endpoint/duration/status; 90d) · health endpoint · uptime alerts · cron watchdogs (fail→email) + status page · cost alerts (SMS/storage budgets) · SMS provider fallback · payment-gateway fallback flag (Cashfree) · feature flags (10% rollouts) · maintenance mode + admin bypass · monthly dependency patching.
- **PWA**: installable · service worker (branded offline page; cached feed + retry banner; offline action queue) · install prompts (Android card weekly if not installed; iOS manual guide overlay) · app shortcuts (New listing/Messages/Search) · icon badge counts · version in settings · update toast ("New version — Refresh") · back-button closes sheets (history-state) · network-failure handling on every action.
- **Browser matrix**: Chrome/Edge (2yr), iOS Safari 15+, Samsung Internet; older → upgrade page. **Performance budgets**: feed <2.5s on 4G · navigation <1s · lazy-load 200px pre-viewport · 60fps GPU-only animations on mid-range Android.
- **Languages**: translation files (admin-editable) · error messages included · Indian number/₹ formatting · instant switch (position preserved) · all-Indian-script Unicode acceptance everywhere.

# 6. LAUNCH OPERATIONS

- **Admin SOP doc**: approval criteria checklist (photo/desc/price sanity; co-ownership + POA = normal; multi-broker allowed; caps-nudge not block) · reviewer capacity math (3–5 min/listing; 24h SLA) · rejection/changes templates usage.
- **Seeding**: 100–200 founding listings onboarded pre-launch (payment-first intact; admin manual grants where needed).
- **Soft launch**: 2 weeks friends-&-family with real payments before public.
- **Pre-launch checklist**: legal entity + current account + Razorpay KYC (1–2wk lead) · DLT SMS registration · WhatsApp template approvals (Meta) · domain/trademark/social-handle checks (HomzList) · lawyer T&C review · Grievance Officer appointed + published · Search Console + Business Profile · load test · backup restore drill · QA matrix (3 device sizes × slow-3G × offline × dark mode × Gujarati × **Instagram side-by-side parity pass**) · analytics events wired + verified: signup, plan_purchase, listing_submit, listing_approved, inquiry_sent, chat_accepted, number_allowed, proposal_sent, boost_purchase, requirement_posted · GA4/Plausible + funnel dashboards · 2 super admins confirmed · rollback plan rehearsed · support SLA for first weeks · cost alerts armed.
- **Build phases**: **P1 (launch)** = auth, roles, plans+payments, listing creation (full fields/photos), admin approval + core panel, feed + auto-stories, search + SEO structure, inquiry/chat/number, 4-tab messages, profiles, notifications (push+email), report/block, legal + grievance, PWA + Instagram UX layer, security layer. **P2** = matching engine + proposals full, boost, saved-search alerts, WhatsApp channel, digests, collections, pinned/featured, QR, Meilisearch, coupons/trials, admin analytics. **P3** = merge tooling, advanced metrics, fingerprinting, polish backlog.

---

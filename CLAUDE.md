# HomzList — Project Brain

## What this is
Instagram-style real estate listing PWA. Photos + text only. No video/reels/follow/map/comments/user-stories.
Roles: Guest, Owner, Broker, Builder (+ Admin/Staff on separate subdomain).

## Stack (never swap without asking)
- Next.js (App Router) + TypeScript
- Supabase (Postgres + Auth-data + Realtime) — RLS MANDATORY on every table. Use @supabase/ssr package (NOT deprecated auth-helpers)
- Cloudflare R2 (images + CDN)
- Redis + BullMQ (cache + queues)
- Tailwind CSS (tokens from Doc 1 only)
- Razorpay (payments), FCM (push), Resend (email)
- OTP: DEV MODE now (fixed code, no SMS) → MSG91+DLT later via provider layer

## Subdomains (one codebase, middleware routing)
- homzlist.com → public: feed, search, detail, area pages, blog, legal (SSR, SEO)
- seller.homzlist.com → Owner/Broker/Builder: create, chat, leads, profile, plans
- account.homzlist.com → Admin/Staff only (Google auth, fully isolated)

## DESIGN LOCK (STRICT — highest priority, never violate)

The mobile design I provided in designs/ is FINAL and LOCKED.

1. Implement the mobile design EXACTLY as given — same layout, spacing, sizing,
   colors, fonts, components, icons, popups, sheets, toasts, dialogs, notifications,
   positions, and hierarchy. Pixel-for-pixel. Zero creativity, zero "improvement",
   zero rearranging, zero adding, zero removing.

2. The mobile design must NOT change by even 0.001%. It is untouchable.

3. The ONLY thing allowed is FIXING genuine technical problems that break the design,
   WITHOUT changing the design's look:
   - overflow / clipping / cut-off text
   - broken alignment
   - unresponsive popup/sheet open-close
   - a dead/non-working button or flow
   - console errors
   These are FIXES (making the given design work correctly), not design changes.
   A fix must keep the exact same visual appearance — if a "fix" changes how it
   looks, it is NOT allowed; ask me first.

4. Desktop and tablet get SEPARATE native layouts (user-side only) — but building
   those must NEVER alter the mobile design in any way. Admin (P13-14-15) already
   has all 3 device layouts — implement as-is, don't re-design it.

5. If anything in the design is unclear or seems wrong, STOP and ASK me before
   changing anything. Never assume and build your own version.

Rule of thumb: I am the PAINTER (design is done). You are the ENGINEER (make it
work exactly as painted). Never repaint.

## BACKEND & DATA LOCK (STRICT — highest priority, ALL modules, never violate)

Everything is backend/database-driven. NOTHING business-related is stored or
decided in the frontend or localStorage.

1. Source of truth = server + Supabase. The frontend only displays what the
   server returns; it never holds the source of truth. No business data, flags,
   prices, paid-status, roles, entitlements, counts, or locked content in
   frontend state or localStorage (UI-only prefs like theme/onboarding are fine).

2. Identity & data live in Supabase. User identity, role, and all user data live
   in Supabase (auth.users + tables). Signup/registration writes to Supabase
   server-side via the service-role key, NEVER to frontend state. profiles.id =
   auth.users.id (identity is linked, not invented client-side).

3. Server-verified every request. Auth session, role and permissions are checked
   server-side on EVERY request. Access + refresh tokens are httpOnly cookies
   (refresh server-tracked, rotating). NEVER put session/refresh tokens or
   business data in localStorage/sessionStorage.

4. Two walls, always. (a) API authorization (server checks role + ownership) and
   (b) Supabase RLS on EVERY table. service_role key is server-only, never in the
   client bundle. Private fields (Views/Leads/numbers/docs/email/locked data) are
   stripped server-side before the payload — never hidden with CSS.

5. Real migrations, run. Every schema change is a file in supabase/migrations,
   applied to Supabase (dev now; staged + human-run for prod). No table ships
   without RLS.

6. Never trust the browser. Every input validated + authorized server-side;
   generic responses (no enumeration leaks); secrets in env only. Prices/GST/
   entitlements computed server-side.

Rule of thumb: the frontend is a thin view over a server that owns and verifies
all truth.

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
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
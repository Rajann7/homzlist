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
   and Claude applies it to the DEV Supabase project itself — don't leave a
   module blocked waiting on me. Production stays staged + human-run. No table
   ships without RLS.

6. Never trust the browser. Every input validated + authorized server-side;
   generic responses (no enumeration leaks); secrets in env only. Prices/GST/
   entitlements computed server-side.

7. **A-to-Z DATABASE-DRIVEN. No exceptions, no placeholders.** EVERY value the
   site shows — every count, label, badge, price, stat, list, status, option,
   dropdown item, empty-state number — comes from Supabase. Specifically BANNED:
   - hardcoded counts or stats (a "Listings 0" that isn't a real query),
   - mock/sample/placeholder arrays shipped as if they were data,
   - `TODO: real data later` left in a shipped screen,
   - deriving a business value in the client that the server should compute,
   - option lists (types, amenities, plans, locations…) hardcoded in a component
     instead of read from a config table.
   If the data source does not exist yet, BUILD the table + endpoint. Do not
   fake it in the frontend and do not leave a dead placeholder.

8. **VERIFY FROM THE DATABASE, EVERY TIME.** A feature is NOT done until I have
   queried Supabase and shown the actual row(s) it wrote or read. Claiming
   "it works" from a green UI, a 200 response, or a passing type-check is NOT
   acceptance. Every module report must include real DB output.
   `npm run db:proof` prints table row counts + per-user state; use it, plus a
   targeted query for whatever the module touched.

Rule of thumb: the frontend is a thin view over a server that owns and verifies
all truth. If I cannot show you the database row, the feature is not done.

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
12. A-to-Z from the database. Every displayed value is a real query — no hardcoded
    counts, no mock arrays, no placeholder screens. Missing data source = build it.
13. Verify from the database every time. Show the real row(s) in the report. A green
    UI or a 200 response is not proof and is not acceptance.

## Design tokens
See skills/design-system. Accent #0F9D58 (dark #1DB868). Never hardcode hex — use tokens.

## Where things are
- Visual truth: designs/*.html  |  Feature rules: docs/Doc2, Doc3
- Screen specs+flows: docs/Doc4 (user), Doc5 (admin)
- APIs: build/Doc7  |  Architecture: build/Doc8  |  Security: build/Doc9

## HUNT FOR HIDDEN ISSUES (STRICT — every module, not just when asked)

A module is not "what the prompt listed". The prompt is the STARTING POINT for
finding what is silently broken, missing or lying. Never report a module done
after only ticking off the prompt's bullet list.

Every module, walk the prompt line by line and ask of each item:
1. **Is the control real?** Does every toggle/button/field actually write to a
   table and read back from the server? (A `useState` that persists nothing is
   the #1 offender.)
2. **Does the promise have a job behind it?** If a screen says "we'll notify
   you", "expires in 7 days", "auto-refunds" — find the code that does it AND
   the thing that triggers that code. A cron endpoint nobody calls is not done.
3. **Where does the state machine dead-end?** List every status the schema
   allows, then find the code that ENTERS and EXITS each one. A state nothing
   transitions out of is a trap — especially if the user paid to get there.
4. **What happens when step 2 of 2 fails?** Any place we mutate our DB and then
   call a third party (or vice versa) needs a compensating path. Money must
   never be able to leave without the thing it bought, or vice versa.
5. **Is it proven with data?** A status with 0 rows in the DB has never run.
   Seed every state and look at it.
6. **Does the UI tell the truth?** Compare what the screen says against what the
   server actually did (e.g. "no refund" copy on a state that IS refunded).

Report what you FOUND, not just what you built — including things that belong to
a later module, so they get tracked in docs/PENDING-INTEGRATIONS.md instead of
being discovered by a real user. If a gap is out of scope, say so plainly and
record it; never quietly leave it.

## Build discipline
- Read the relevant skill + spec section BEFORE coding a module.
- Plan mode for complex modules. /clear between unrelated modules.
- After each module: run the security + QA checklist (skills/qa-checklist).
- Claude runs migrations on the DEV database as part of finishing a module.
  Production is never touched directly — prod migrations stay staged + human-run.

## Definition of done (every module — all four, no exceptions)
1. **Design**: matches designs/ pixel-exact; Doc1 tokens only, no hardcoded hex.
2. **Database**: every displayed value is a real query; migration written AND run;
   RLS on every new table.
3. **DB-verified**: I ran a real query and pasted the actual row(s) in the report.
   `npm run db:proof` + a targeted query for what the module touched.
4. **Security**: unauthenticated sweep (401s), IDOR probe, secret-grep of the
   built bundle — all shown in the report.

5. **Hidden-issue hunt**: the 6 questions above were actually walked against the
   module prompt, and what I found is reported — including out-of-scope gaps,
   which go into docs/PENDING-INTEGRATIONS.md.

If any of the five is missing, the module is NOT done — say so plainly rather
than reporting it complete.
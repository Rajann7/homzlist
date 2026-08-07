# RATE LIMIT — TEMPORARILY OFF (dev only)

**Status: OFF (disabled on 30 Jul 2026 for browser testing)**
**Reason:** Claude-browser testing hits the same IP and the same login/number over
and over, so the per-IP login limiter and the OTP counters tripped constantly and
blocked test runs (a failed-OTP run could even earn a 24-hour number lock).

Read this file when it is time to switch the limits back ON. Doing that is
step 1 below — one line.

---

## HOW TO TURN IT BACK ON

1. In `.env.local`, set the switch to `0` (or delete the line entirely):

   ```
   DISABLE_RATE_LIMIT=0
   ```

2. Restart the dev server (env vars are read at boot, not per request).

3. Update the **Status** line at the top of this file to `ON`, or delete this
   file — the limits are live again and nothing else needs undoing.

That is the whole revert. **No code needs to be changed or reverted** — the
switch is env-driven and the code around it is permanent, production-safe
plumbing.

---

## WHAT IS ACTUALLY DISABLED

While `DISABLE_RATE_LIMIT=1`:

| Behaviour | Normal | With switch ON |
|---|---|---|
| Every `rateLimit(key, limit, window)` call — login, OTP send, search, uploads, chat, admin actions, all of them | Redis fixed-window counter | Always `allowed: true`, nothing written to Redis |
| OTP 24h number lock (`isNumberLocked`) | Locks a number after 10 failed codes/day | Always reports unlocked |

Still ENFORCED (deliberately not touched):
- OTP **per-session** attempt cap (3 tries per code) and the 30s resend gap —
  these are session-scoped, they don't leak across a test run.
- Device bans (`lib/admin/deviceBans.ts`) — a separate, admin-driven mechanism.
- Every authorization check, RLS policy, and session check. This switch only
  removes throttling, never a permission wall.

## WHERE THE CODE IS

- `lib/auth/rate-limit.ts` — exports `rateLimitDisabled`; `rateLimit()` returns
  early when it is set.
- `lib/auth/otp.ts` — `isNumberLocked()` honours the same flag.
- `.env.local` — the switch itself. `.env.local.example` documents it.

## SAFETY

`rateLimitDisabled` is `false` whenever the environment band is `production`
(`lib/env` → `envBand()`, driven by `APP_ENV`), regardless of the env var. So
even if `DISABLE_RATE_LIMIT=1` ever leaked into the real site's environment, the
limits stay armed there.

It DOES engage on a staging deploy (`APP_ENV=staging`), which is the point —
browser-driven testing against a deployed test server hits the same counters a
local run does. An undeclared `APP_ENV` on a deployed build counts as
production, so this never turns itself on by accident.

Do **not** ship a production deploy relying on this guarantee alone — set the
env var back to `0` when testing is done, per the steps above.

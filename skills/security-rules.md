# Skill: security-rules

Load on every backend/auth module + review. Condensed Doc9. Full: `build/Doc9 - Security Audit.md`.

## Two walls, always
1. API authorization (server checks role + ownership on every endpoint).
2. Supabase RLS (row-level, DB-enforced) on EVERY table.
Both required. Never trust the client. `service_role` key server-only (never in client bundle).

## Non-negotiables per endpoint
- Validate every input server-side (type/length/enum/format/unicode-bounded). Cap `limit`; cursor pagination.
- Whitelist writable fields (no mass-assignment: user can't set role/plan/balance/status/is_verified).
- IDOR: ownership-checked + RLS; **404 (not 403)** for hidden/draft/private (no existence leak). Non-sequential IDs (UUID/nanoid).
- Numbers absent from payload until Allow (poster-sees-sender computed server-side). Locked-requirement data stripped server-side. DevTools-proof.
- Errors: `{ code, message_key }` only; stack/detail to logs/Sentry. Consistent shapes (don't leak existence).

## Auth / session
- Phone+OTP (dev mode now). 3 verify / 10 fails-day → 24h lock / 30s×3 resend. Generic responses (anti-enumeration).
- Access 15-min, refresh 30-day httpOnly + Secure + SameSite=Lax + subdomain-scoped + rotating. No token in localStorage.
- Logged-in → /login redirects home. Guest → gated route → server redirect (no client-only guard, no flash).
- Admin: account.homzlist.com isolated, Google whitelist server-checked, chat READ-ONLY at API, impersonation sends disabled, every action audit-logged.

## Payments (Doc9 §12)
Server computes amount/GST/coupon; client amounts ignored. Webhook HMAC + idempotency; activate only after Razorpay-confirmed capture. Refund atomic (money + benefit revoke). Keys server-only.

## Other
Rate-limit + lockout + honeypot (NO CAPTCHA). File upload: magic-bytes, size caps, presign scoped, re-encode/strip EXIF, ClamAV for PDFs. SSRF: block internal IPs/metadata, allowlist. XSS: React escapes; never `dangerouslySetInnerHTML` with user content. CSRF: SameSite + origin/token. Headers ≥ A/B (`next.config.mjs`). Verify AI-suggested packages are real (slopsquatting).

## Per-module audit (Doc9 §29)
secrets grep · route auth (curl 401/403) · IDOR swap · injection test · localStorage clean · unhappy paths · deps verified.

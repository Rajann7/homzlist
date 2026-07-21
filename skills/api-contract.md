# Skill: api-contract

Load on backend work. Condensed Doc7. Full: `build/Doc7 - API List.md`. Helpers: `lib/api.ts`.

## Global (Doc7 §0)
- Base `/api/v1/`. Envelope: `{ ok:true, data }` | `{ ok:false, error:{ code, message_key } }` (use `ok()` / `fail()` from `lib/api.ts`).
- Auth via httpOnly session cookie (access 15-min, refresh 30-day rotating, subdomain-scoped). Middleware validates on every protected route (SSR — no flash).
- Every endpoint: role + ownership check server-side + RLS. Validate every input.
- Pagination cursor-based: `?cursor=&limit=` → `{ items, nextCursor }`. Cap limit.
- Idempotency keys on payment/webhook/proposal-send.
- Subdomain scope: (public) guest-readable · (seller) seller session · (admin) admin Google session.

## Error codes (Doc7 §20 — in `lib/api.ts` ERROR_CODES)
OTP_INVALID, OTP_LOCKED, RATE_LIMITED, NUMBER_LOCKED, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, PLAN_REQUIRED, QUOTA_EXHAUSTED, NEED_TOPUP, PAYMENT_FAILED, PAYMENT_PENDING, DUPLICATE_PROPOSAL, SELF_ACTION_BLOCKED, LISTING_STATE_LOCKED, NUMBER_NOT_ALLOWED, VALIDATION_ERROR, FILE_TOO_LARGE, FILE_TYPE_BLOCKED, MAINTENANCE, SERVER_ERROR.

## Endpoint groups (Doc7 §1–15)
auth · profile · billing (plans/payments/boost) · listings/projects · requirements/proposals/matching · feed/stories · chat/number · search/SEO · notifications · admin/* · master-data · cms/legal/blog · templates/settings/flags · support/disputes/staff/audit · system/analytics/trash/exports.

## Realtime (Doc7 §16)
Supabase Realtime; events carry IDs ONLY (client re-fetches gated data so RLS applies; numbers never in event payloads before allow).

## Backend-only enforcement (Doc7 §19)
paid-status/plan-balance/entitlement, locked data, numbers, listing-state access, roles/permissions, prices/GST/coupon, feature flags — ALL server-decided. No frontend flag grants access.

## Queues (Doc8 §3 — `lib/queues/`)
image · notification · matching · email. Enqueue and return instantly; workers (`npm run worker`) do heavy work.

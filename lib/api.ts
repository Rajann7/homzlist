import { NextResponse } from "next/server";

/**
 * API response envelope + error contract (Doc7 §0, §13, §20).
 *  Success: { ok: true, data }
 *  Failure: { ok: false, error: { code, message_key } }
 *
 * Only a friendly `message_key` crosses the wire — the client translates it
 * (EN/GU/HI). Stack/detail stays server-side (Sentry/logs), never leaked (Doc9 §20).
 */

export const ERROR_CODES = [
  "OTP_INVALID",
  "OTP_LOCKED",
  "RATE_LIMITED",
  "NUMBER_LOCKED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "PLAN_REQUIRED",
  "QUOTA_EXHAUSTED",
  "NEED_TOPUP",
  "PAYMENT_FAILED",
  "PAYMENT_PENDING",
  "DUPLICATE_PROPOSAL",
  "SELF_ACTION_BLOCKED",
  "PROFILE_INCOMPLETE",   // min-profile (name + city) required before inquiring/chatting
  "INQUIRY_COOLDOWN",     // the poster declined; re-inquiry opens again after cooldown_until
  "PROJECT_REQUIRED",     // builder proposing with no LIVE project (0087 rule)
  "LISTING_STATE_LOCKED",
  "NUMBER_NOT_ALLOWED",
  "VALIDATION_ERROR",
  "FILE_TOO_LARGE",
  "FILE_TYPE_BLOCKED",
  "MAINTENANCE",
  "SERVER_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Map each code to a translation key the client resolves to a friendly message. */
const MESSAGE_KEY: Record<ErrorCode, string> = Object.fromEntries(
  ERROR_CODES.map((c) => [c, `error.${c.toLowerCase()}`]),
) as Record<ErrorCode, string>;

const HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  PROFILE_INCOMPLETE: 403,
  INQUIRY_COOLDOWN: 403,
  PROJECT_REQUIRED: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 422,
  MAINTENANCE: 503,
  SERVER_ERROR: 500,
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true as const, data }, init);
}

export function fail(code: ErrorCode, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false as const, error: { code, message_key: MESSAGE_KEY[code], ...extra } },
    { status: HTTP_STATUS[code] ?? 400 },
  );
}

/** Cursor pagination shape (Doc7 §0). */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

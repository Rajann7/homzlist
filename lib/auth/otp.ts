import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { kv } from "@/lib/kv";
import { rateLimit } from "./rate-limit";
import { getOtpProvider, generateOtpCode } from "./otp-provider";

/**
 * OTP lifecycle (Doc2 §3.1 / Doc9 §13). All state server-side.
 * Limits: 3 verify attempts/session · resend after 30s, max 3/session ·
 * 10 fails/day/number → 24h lock · SMS 3/hr/number, 10/day/IP.
 * Codes are stored HASHED with a per-session salt (audit L2). Sessions expire.
 */
export const OTP = {
  TTL_SEC: 5 * 60,
  MAX_VERIFY_ATTEMPTS: 3,
  MAX_RESENDS: 3,
  RESEND_GAP_SEC: 30,
  DAILY_FAIL_LOCK: 10,
  LOCK_SEC: 24 * 60 * 60,
  SMS_PER_HOUR_NUMBER: 3,
  SMS_PER_DAY_IP: 10,
} as const;

interface OtpSession {
  phone: string;
  codeHash: string;
  attempts: number;
  resends: number;
  lastSentAt: number;
  createdAt: number;
}

const sessKey = (id: string) => `otp:sess:${id}`;
const lockKey = (phone: string) => `otp:lock:${phone}`;
const failKey = (phone: string) => `otp:fail:${phone}`;

const SALT = "homzlist-otp-v1";
const hashCode = (code: string, sessionId: string) =>
  createHash("sha256").update(`${SALT}:${sessionId}:${code}`).digest("hex");

export interface RequestOtpOutcome {
  ok: boolean;
  reason?: "RATE_LIMITED" | "NUMBER_LOCKED";
  otpSession?: string;
  resendIn?: number;
  attemptsLeft?: number;
  retryAfterSec?: number;
  devCode?: string;
}

export async function isNumberLocked(phone: string): Promise<boolean> {
  return (await kv.exists(lockKey(phone))) === 1;
}

export async function requestOtp(phone: string, ipHash: string): Promise<RequestOtpOutcome> {
  if (await isNumberLocked(phone)) return { ok: false, reason: "NUMBER_LOCKED" };

  const perNumber = await rateLimit(`otp:num:${phone}`, OTP.SMS_PER_HOUR_NUMBER, 3600);
  const perIp = await rateLimit(`otp:ip:${ipHash}`, OTP.SMS_PER_DAY_IP, 86400);
  if (!perNumber.allowed || !perIp.allowed) {
    const worst = !perNumber.allowed ? perNumber : perIp;
    return { ok: false, reason: "RATE_LIMITED", retryAfterSec: worst.retryAfterSec };
  }

  const id = randomUUID();
  const provider = getOtpProvider();
  const code = provider.codeFor(phone, generateOtpCode());
  const send = await provider.send(phone, code);

  const session: OtpSession = {
    phone,
    codeHash: hashCode(code, id),
    attempts: 0,
    resends: 0,
    lastSentAt: Date.now(),
    createdAt: Date.now(),
  };
  await kv.set(sessKey(id), JSON.stringify(session), OTP.TTL_SEC);

  return {
    ok: true,
    otpSession: id,
    resendIn: OTP.RESEND_GAP_SEC,
    attemptsLeft: OTP.MAX_VERIFY_ATTEMPTS,
    devCode: send.devCode,
  };
}

export interface ResendOutcome {
  ok: boolean;
  reason?: "NOT_FOUND" | "TOO_SOON" | "RESEND_LIMIT" | "NUMBER_LOCKED" | "RATE_LIMITED";
  resendIn?: number;
  waitSec?: number;
  retryAfterSec?: number;
  devCode?: string;
}

export async function resendOtp(otpSession: string, ipHash: string): Promise<ResendOutcome> {
  const raw = await kv.get(sessKey(otpSession));
  if (!raw) return { ok: false, reason: "NOT_FOUND" };
  const s: OtpSession = JSON.parse(raw);

  if (await isNumberLocked(s.phone)) return { ok: false, reason: "NUMBER_LOCKED" };
  if (s.resends >= OTP.MAX_RESENDS) return { ok: false, reason: "RESEND_LIMIT" };

  const elapsed = (Date.now() - s.lastSentAt) / 1000;
  if (elapsed < OTP.RESEND_GAP_SEC) {
    return { ok: false, reason: "TOO_SOON", waitSec: Math.ceil(OTP.RESEND_GAP_SEC - elapsed) };
  }

  // Audit L1: a resend is an SMS — charge the same per-number/per-IP caps.
  const perNumber = await rateLimit(`otp:num:${s.phone}`, OTP.SMS_PER_HOUR_NUMBER, 3600);
  const perIp = await rateLimit(`otp:ip:${ipHash}`, OTP.SMS_PER_DAY_IP, 86400);
  if (!perNumber.allowed || !perIp.allowed) {
    const worst = !perNumber.allowed ? perNumber : perIp;
    return { ok: false, reason: "RATE_LIMITED", retryAfterSec: worst.retryAfterSec };
  }

  const provider = getOtpProvider();
  const code = provider.codeFor(s.phone, generateOtpCode());
  const send = await provider.send(s.phone, code);

  s.codeHash = hashCode(code, otpSession);
  s.resends += 1;
  // A freshly sent code is a fresh verification opportunity — reset the
  // per-session attempt counter so the new (correct) code can succeed. Without
  // this, a user who exhausted 3 attempts stays dead-ended even after Resend
  // re-enables the inputs (the abuse ceilings remain: MAX_RESENDS + the 10/day
  // number lock, which are NOT reset here).
  s.attempts = 0;
  s.lastSentAt = Date.now();
  await kv.set(sessKey(otpSession), JSON.stringify(s), OTP.TTL_SEC);

  return { ok: true, resendIn: OTP.RESEND_GAP_SEC, devCode: send.devCode };
}

export interface VerifyOutcome {
  ok: boolean;
  reason?: "NOT_FOUND" | "INVALID" | "EXHAUSTED" | "LOCKED";
  phone?: string;
  attemptsLeft?: number;
  lockedNow?: boolean;
}

export async function verifyOtp(otpSession: string, code: string): Promise<VerifyOutcome> {
  const raw = await kv.get(sessKey(otpSession));
  if (!raw) return { ok: false, reason: "NOT_FOUND" };
  const s: OtpSession = JSON.parse(raw);

  if (await isNumberLocked(s.phone)) return { ok: false, reason: "LOCKED" };
  if (s.attempts >= OTP.MAX_VERIFY_ATTEMPTS) return { ok: false, reason: "EXHAUSTED", attemptsLeft: 0 };

  if (hashCode(code, otpSession) === s.codeHash) {
    await kv.del(sessKey(otpSession)); // one-time use
    return { ok: true, phone: s.phone };
  }

  s.attempts += 1;
  await kv.set(sessKey(otpSession), JSON.stringify(s), OTP.TTL_SEC);

  const dailyFails = await kv.incr(failKey(s.phone));
  if (dailyFails === 1) await kv.expire(failKey(s.phone), 86400);

  if (dailyFails >= OTP.DAILY_FAIL_LOCK) {
    await kv.set(lockKey(s.phone), "1", OTP.LOCK_SEC);
    return { ok: false, reason: "LOCKED", lockedNow: true };
  }

  const sessionLeft = OTP.MAX_VERIFY_ATTEMPTS - s.attempts;
  return { ok: false, reason: sessionLeft <= 0 ? "EXHAUSTED" : "INVALID", attemptsLeft: sessionLeft };
}

import "server-only";
import { serverEnv } from "@/lib/env";
import { maskPhone } from "./phone";

/**
 * OTP provider abstraction (Doc6 §7 / CLAUDE.md — provider layer).
 *  - DEV: no SMS. Uses OTP_DEV_FIXED_CODE, logs it server-side (masked number).
 *  - MSG91: stub — drops in at launch via env, no code changes elsewhere.
 * `devCode` is returned to the caller ONLY in dev so the flow is testable; it is
 * NEVER exposed in production (the dev provider itself is blocked in prod below).
 */
export interface OtpSendResult {
  ok: boolean;
  devCode?: string; // dev only
}

interface OtpProvider {
  send(e164: string, code: string): Promise<OtpSendResult>;
  codeFor(e164: string, generated: string): string;
}

const devProvider: OtpProvider = {
  async send(e164, code) {
    console.log(`[otp:dev] code for ${maskPhone(e164)} = ${code} (no SMS in dev)`);
    return { ok: true, devCode: code };
  },
  codeFor() {
    return serverEnv().otp.devFixedCode;
  },
};

const msg91Provider: OtpProvider = {
  async send() {
    throw new Error("MSG91 provider not configured — set OTP_PROVIDER=msg91 + keys at launch.");
  },
  codeFor(_e164, generated) {
    return generated;
  },
};

export function getOtpProvider(): OtpProvider {
  const provider = serverEnv().otp.provider;
  // Audit M1: the dev provider accepts the fixed code for ANY number and echoes
  // devCode — it must NEVER run in production. Fail closed (no auth) rather than
  // ship a "123456-accepts-anyone" bypass.
  if (provider !== "msg91" && process.env.NODE_ENV === "production") {
    throw new Error("Dev OTP provider is not allowed in production — set OTP_PROVIDER=msg91.");
  }
  return provider === "msg91" ? msg91Provider : devProvider;
}

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

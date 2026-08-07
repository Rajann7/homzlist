import "server-only";
import { devAffordancesAllowed, serverEnv } from "@/lib/env";
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
  // devCode — it must NEVER run in the production band. Fail closed (no auth)
  // rather than ship a "123456-accepts-anyone" bypass. The band, not NODE_ENV:
  // a staging deploy is a production BUILD and could otherwise never be signed
  // into, and an undeclared APP_ENV on a deployed build is still "production".
  if (provider !== "msg91" && !devAffordancesAllowed()) {
    throw new Error(
      "Dev OTP provider is not allowed in the production band — set OTP_PROVIDER=msg91 " +
        "(or APP_ENV=staging on a test deploy).",
    );
  }
  return provider === "msg91" ? msg91Provider : devProvider;
}

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

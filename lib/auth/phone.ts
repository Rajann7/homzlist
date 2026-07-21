/**
 * Phone validation + normalisation (Doc2 §3.1). India-only: +91, 10 digits,
 * first digit 6-9. Stored E.164 (+919825012345). Server-side is the source of
 * truth — the client format is never trusted.
 */
const TEN_DIGIT = /^[6-9]\d{9}$/;

export function extractTenDigits(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isValidIndianMobile(raw: string): boolean {
  return TEN_DIGIT.test(extractTenDigits(raw));
}

export function toE164(raw: string): string | null {
  const ten = extractTenDigits(raw);
  return TEN_DIGIT.test(ten) ? `+91${ten}` : null;
}

/** Mask for display / logs: +91 98••• ••345 (never log the full number — Doc9 §19). */
export function maskPhone(e164: string): string {
  const ten = e164.replace(/^\+91/, "");
  if (ten.length !== 10) return "+91 ••••• •••••";
  return `+91 ${ten.slice(0, 2)}••• ••${ten.slice(7)}`;
}

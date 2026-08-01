import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * WhatsApp, through the same provider layer as OTP (MSG91 + DLT).
 *
 * Deliberately the SAME SHAPE as `sendEmail`: a result that says whether it
 * went, and if it did not, exactly why. That matters more than it looks — A11's
 * Send-message sheet offers three channels, and a channel that silently does
 * nothing while the row records "delivered" is the screen lying on the
 * platform's behalf.
 *
 * `no_credentials` is a REAL outcome, recorded in `notification_deliveries`
 * like any other. When MSG91's WhatsApp keys land, nothing here changes and
 * nothing calling it changes: the same call starts returning `sent: true`.
 */

export interface WhatsAppResult {
  sent: boolean;
  providerId?: string;
  reason?: string;
}

export function isWhatsAppConfigured(): boolean {
  const { otp } = serverEnv();
  return Boolean(process.env.MSG91_WA_NUMBER && otp.msg91AuthKey);
}

export async function sendWhatsApp(input: {
  /** E.164, as stored on the profile */
  to: string;
  body: string;
}): Promise<WhatsAppResult> {
  const { otp } = serverEnv();
  const from = process.env.MSG91_WA_NUMBER ?? "";
  if (!otp.msg91AuthKey || !from) return { sent: false, reason: "no_credentials" };
  if (!/^\+?[1-9]\d{7,14}$/.test(input.to.replace(/\s/g, ""))) {
    return { sent: false, reason: "no_number" };
  }

  try {
    const res = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/", {
      method: "POST",
      headers: { authkey: otp.msg91AuthKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        integrated_number: from,
        content_type: "text",
        payload: {
          to: input.to.replace(/\s/g, ""),
          type: "text",
          text: { body: input.body.slice(0, 4000) },
        },
      }),
    });
    if (!res.ok) return { sent: false, reason: `http_${res.status}` };
    const json = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { sent: true, providerId: json.messageId };
  } catch {
    return { sent: false, reason: "network" };
  }
}

import "server-only";
import { serverEnv, publicEnv } from "@/lib/env";

/**
 * Transactional email via Resend (Doc2 §14 channel 2).
 *
 * Plain `fetch` against the Resend REST API — no SDK, so nothing extra lands in
 * the bundle and the failure mode is a plain HTTP status we can log. Like push,
 * this is best-effort: a mail failure must never break the action that produced
 * the notification. The caller records the outcome in `notification_deliveries`,
 * so a silent drop is still visible in the ledger.
 *
 * The recipient is ALWAYS the address on the account, resolved server-side by
 * the caller. No endpoint accepts a recipient from the browser (Doc9 §13).
 */

export interface EmailResult {
  sent: boolean;
  providerId?: string;
  reason?: string;
}

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c]);

/**
 * One template for every notification email. Deliberately plain: a single
 * accent header bar, the title, the body, one call-to-action, and the
 * preferences link DPDP requires on every message we send.
 */
export function renderEmail(input: { title: string; body?: string; href?: string | null; cta?: string }): string {
  const site = publicEnv.appUrl.replace(/\/$/, "");
  const link = input.href ? (input.href.startsWith("http") ? input.href : `${site}${input.href}`) : null;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAFA;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #DBDBDB;border-radius:12px;overflow:hidden">
  <tr><td style="padding:16px 20px;border-bottom:1px solid #EFEFEF;font-size:20px;font-weight:700;color:#111111">Homz<span style="color:#0F9D58">List</span></td></tr>
  <tr><td style="padding:24px 20px">
    <div style="font-size:17px;font-weight:600;color:#111111;line-height:1.4">${esc(input.title)}</div>
    ${input.body ? `<div style="font-size:14px;color:#555555;line-height:1.6;margin-top:8px">${esc(input.body)}</div>` : ""}
    ${link ? `<div style="margin-top:20px"><a href="${esc(link)}" style="display:inline-block;background:#0F9D58;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px">${esc(input.cta ?? "Open HomzList")}</a></div>` : ""}
  </td></tr>
  <tr><td style="padding:16px 20px;border-top:1px solid #EFEFEF;font-size:11px;color:#8E8E8E;line-height:1.6">
    You received this because of activity on your HomzList account.
    <a href="${esc(site)}/settings/notifications" style="color:#0F9D58;text-decoration:none">Manage notification preferences</a>.
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailResult> {
  const { resendApiKey, emailFrom } = serverEnv();
  if (!resendApiKey) return { sent: false, reason: "no_credentials" };
  if (!input.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.to)) return { sent: false, reason: "no_address" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: emailFrom, to: [input.to], subject: input.subject, html: input.html }),
    });
    if (!res.ok) return { sent: false, reason: `http_${res.status}` };
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, providerId: json.id };
  } catch {
    return { sent: false, reason: "network" };
  }
}

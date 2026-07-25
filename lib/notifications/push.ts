import "server-only";
import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * FCM push delivery (Doc7 §16). Uses firebase-admin with the service account in
 * FCM_SERVICE_ACCOUNT_JSON (env-only, never committed). Everything here is
 * best-effort: no credentials or no tokens → a no-op that never throws, so a
 * push failure can never break the chat action that triggered it.
 *
 * Device tokens are registered by the client after it obtains an FCM web token
 * (needs the PUBLIC Firebase web config + a VAPID key — see
 * docs/PENDING-INTEGRATIONS.md). Until those exist no token is stored and this
 * sender simply finds nothing to send to; the pipeline is otherwise complete.
 */

let cachedApp: unknown | null | undefined; // undefined = not tried, null = unavailable

function fcmApp(): any {
  if (cachedApp !== undefined) return cachedApp;
  const json = serverEnv().fcmServiceAccountJson;
  if (!json) return (cachedApp = null);
  let creds: any;
  try { creds = JSON.parse(json); } catch { return (cachedApp = null); }
  try {
    // firebase-admin v14 modular API (lazy-required to stay out of the client bundle).
    const { initializeApp, getApps, getApp, cert } = require("firebase-admin/app");
    cachedApp = getApps().length ? getApp() : initializeApp({ credential: cert(creds) });
  } catch {
    cachedApp = null;
  }
  return cachedApp;
}

/** Coerce a data payload to the string→string map FCM requires. */
function stringifyData(data: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) out[k] = v == null ? "" : String(v);
  return out;
}

export async function sendPushToProfile(
  profileId: string,
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<{ sent: number; reason?: string }> {
  const app = fcmApp();
  if (!app) return { sent: 0, reason: "no_credentials" };

  const db = createServiceClient();
  const { data: rows } = await db.from("push_tokens").select("token").eq("profile_id", profileId);
  const tokens = (rows as { token: string }[] ?? []).map((r) => r.token).filter(Boolean);
  if (!tokens.length) return { sent: 0, reason: "no_tokens" };

  try {
    const { getMessaging } = require("firebase-admin/messaging");
    const res = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: stringifyData(payload.data),
    });
    // Prune tokens FCM reports as permanently invalid.
    const dead: string[] = [];
    res.responses.forEach((r: any, i: number) => {
      const code = r.error?.code ?? "";
      if (!r.success && (code.includes("registration-token-not-registered") || code.includes("invalid-argument"))) dead.push(tokens[i]);
    });
    if (dead.length) await db.from("push_tokens").delete().eq("profile_id", profileId).in("token", dead);
    return { sent: res.successCount };
  } catch {
    return { sent: 0, reason: "send_failed" };
  }
}

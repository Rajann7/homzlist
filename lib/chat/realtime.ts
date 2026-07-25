import "server-only";
import { publicEnv, serverEnv } from "@/lib/env";
import { threadTopic, inboxTopic } from "./realtime-topics";

/**
 * Realtime fan-out for chat (Doc7 §16). The chat tables are RLS deny-all and
 * users authenticate with our own JWT (not a Supabase session), so Postgres-
 * changes replication can't reach the browser. Instead the server pushes a tiny
 * "something changed" ping over Supabase Realtime BROADCAST — which is
 * independent of table RLS — and the client refetches through the normal sealed
 * API. No business data ever rides the socket; the payload is just a nudge.
 *
 * Uses the Realtime HTTP broadcast endpoint (no persistent socket), so it is
 * safe to call from a stateless route handler. Fully best-effort: any failure is
 * swallowed — realtime is an accelerator on top of the poll, never a dependency.
 */

async function broadcast(topic: string, event: string): Promise<void> {
  try {
    const url = publicEnv.supabaseUrl;
    const key = serverEnv().supabaseServiceRoleKey;
    if (!url || !key) return;
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic, event, payload: { t: Date.now() } }] }),
      // Don't let a slow realtime host stall the chat action.
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // realtime is best-effort — the poll still delivers
  }
}

/** Nudge everyone viewing a specific thread to refetch it. */
export async function pingThread(threadId: string): Promise<void> {
  await broadcast(threadTopic(threadId), "refresh");
}

/** Nudge a user's Messages list to refetch (new/updated thread). */
export async function pingInbox(profileId: string): Promise<void> {
  await broadcast(inboxTopic(profileId), "refresh");
}

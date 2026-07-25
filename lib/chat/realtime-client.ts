"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Subscribe to a chat broadcast topic (see lib/chat/realtime.ts). `onRefresh`
 * fires on a server "refresh" ping (refetch through the sealed API — the socket
 * never carries business data). `onTyping` fires on a peer "typing" ping.
 * Returns an unsubscribe fn + a `sendTyping` to broadcast our own typing on the
 * same channel. Safe if realtime is unavailable — it just never fires.
 */
export function subscribeChat(
  topic: string,
  handlers: { onRefresh?: () => void; onTyping?: (payload: any) => void },
): { unsubscribe: () => void; sendTyping: (payload?: any) => void } {
  let channel: any = null;
  try {
    const supabase = createClient();
    channel = supabase
      .channel(topic, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "refresh" }, () => handlers.onRefresh?.())
      .on("broadcast", { event: "typing" }, (m: any) => handlers.onTyping?.(m?.payload ?? {}))
      .subscribe();
  } catch {
    return { unsubscribe: () => {}, sendTyping: () => {} };
  }
  return {
    unsubscribe: () => { try { channel?.unsubscribe(); } catch { /* noop */ } },
    sendTyping: (payload = {}) => { try { channel?.send({ type: "broadcast", event: "typing", payload }); } catch { /* noop */ } },
  };
}

/**
 * Fire-and-forget "typing" broadcast to a topic we don't hold a live channel for
 * (e.g. the peer's inbox, so their Messages list can show "Typing…"). Lazily
 * opens a short-lived channel, sends once, then closes.
 */
export function broadcastTyping(topic: string, payload: Record<string, unknown> = {}): void {
  try {
    const supabase = createClient();
    const ch = supabase.channel(topic);
    ch.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        try { ch.send({ type: "broadcast", event: "typing", payload }); } catch { /* noop */ }
        setTimeout(() => { try { ch.unsubscribe(); } catch { /* noop */ } }, 400);
      }
    });
  } catch { /* noop */ }
}

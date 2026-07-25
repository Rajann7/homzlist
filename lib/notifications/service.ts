import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToProfile } from "./push";

/**
 * Notifications (Doc7 §16). One entry point — `notify` — that records an in-app
 * notification row AND best-effort fires an FCM push. It is fully swallowed on
 * error: a notification must NEVER break the chat action that produced it.
 *
 * The unread CHAT badge stays driven by the message read-cursor
 * (lib/chat/service.ts · unreadTotal); these rows power the notifications
 * surface + device push.
 */

export type NotificationType =
  | "inquiry_received" | "proposal_received" | "chat_accepted"
  | "number_requested" | "number_shared" | "new_message";

export interface NotifyInput {
  profileId: string;              // recipient
  type: NotificationType;
  title: string;
  body?: string;
  threadId?: string | null;
  actorId?: string | null;        // who caused it
  data?: Record<string, unknown>;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from("notifications").insert({
      profile_id: input.profileId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      thread_id: input.threadId ?? null,
      actor_id: input.actorId ?? null,
      data: input.data ?? {},
    });
    await sendPushToProfile(input.profileId, {
      title: input.title,
      body: input.body ?? "",
      data: { type: input.type, threadId: input.threadId ?? "", ...(input.data ?? {}) },
    });
  } catch {
    // never propagate — the primary action already succeeded
  }
}

/** True when the recipient has muted this thread (skip chat push/notify). */
export async function threadMutedFor(threadId: string, profileId: string): Promise<boolean> {
  try {
    const db = createServiceClient();
    const { data } = await db.from("thread_participants").select("muted").eq("thread_id", threadId).eq("profile_id", profileId).maybeSingle();
    return !!(data as { muted?: boolean } | null)?.muted;
  } catch {
    return false;
  }
}

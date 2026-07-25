"use client";

/**
 * Client-side chat API (Module 7). Asks the server; renders answers. Holds NO
 * business truth — number visibility, verification, unread counts, states are
 * all decided server-side (CLAUDE.md backend lock). The poster's number is only
 * ever present in a payload the server already sealed.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message_key?: string; [k: string]: unknown } };

async function req<T>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/v1${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

export type Tab = "my-listings" | "my-inquiries" | "requirement-leads" | "my-responses";

/**
 * Upload one chat photo: presign (server picks the public chat bucket) → PUT the
 * bytes straight to storage → commit (server magic-byte validates). Returns the
 * public URL to send as a `photo` bubble, plus natural dimensions for aspect.
 * Same three-step shape as profile/listing media (lib/profile/client.ts).
 */
export async function uploadChatPhoto(
  file: File,
): Promise<{ ok: true; url: string; w?: number; h?: number } | { ok: false; error: string }> {
  const pre = await req<{ grant: { url: string; key: string; headers: Record<string, string> } }>(
    "/uploads/presign",
    "POST",
    { kind: "chat", contentType: file.type, size: file.size },
  );
  if (!pre.ok) {
    const c = pre.error.code;
    return {
      ok: false,
      error:
        c === "FILE_TYPE_BLOCKED" ? "Use a JPG, PNG or WebP image"
        : c === "FILE_TOO_LARGE" ? "That image is too large (max 25MB)"
        : c === "RATE_LIMITED" ? "Too many uploads — try again shortly"
        : "Couldn't start the upload",
    };
  }

  let w: number | undefined, h: number | undefined;
  try { const bmp = await createImageBitmap(file); w = bmp.width; h = bmp.height; bmp.close?.(); } catch { /* dims optional */ }

  const g = pre.data.grant;
  try {
    const put = await fetch(g.url, { method: "PUT", headers: g.headers, body: file, credentials: g.url.startsWith("/api/") ? "same-origin" : "omit" });
    if (!put.ok) return { ok: false, error: "Upload failed — check your connection" };
  } catch {
    return { ok: false, error: "Upload failed — you may be offline" };
  }

  const commit = await req<{ url?: string }>("/uploads/commit", "POST", { key: g.key, kind: "chat" });
  if (!commit.ok || !commit.data.url) return { ok: false, error: commit.ok ? "Couldn't save that image" : commit.error.code === "FILE_TYPE_BLOCKED" ? "That isn't a valid image" : "Couldn't save that image" };
  return { ok: true, url: commit.data.url, w, h };
}

export const chatApi = {
  threads: (tab: Tab, opts: { grouping?: boolean; unread?: boolean; q?: string } = {}) => {
    const p = new URLSearchParams({ tab });
    if (opts.grouping) p.set("grouping", "1");
    if (opts.unread) p.set("unread", "1");
    if (opts.q) p.set("q", opts.q);
    return req<any>(`/chat/threads?${p.toString()}`, "GET");
  },
  requests: () => req<any>("/chat/requests", "GET"),
  archived: () => req<any>("/chat/archived", "GET"),
  blocked: () => req<any>("/chat/blocked", "GET"),
  unblockUser: (userId: string) => req<any>("/chat/blocked", "POST", { action: "unblock", userId }),
  requestAct: (threadId: string, action: "accept" | "decline") => req<any>(`/chat/requests/${threadId}`, "POST", { action }),
  thread: (id: string, before?: string) => req<any>(`/chat/threads/${id}${before ? `?before=${encodeURIComponent(before)}` : ""}`, "GET"),
  details: (id: string) => req<any>(`/chat/threads/${id}/details`, "GET"),
  send: (id: string, input: { text?: string; photoUrl?: string; photoW?: number; photoH?: number; replyTo?: string | null }) => req<any>(`/chat/threads/${id}/message`, "POST", input),
  read: (id: string) => req<any>(`/chat/threads/${id}/read`, "POST"),
  readAll: () => req<any>("/chat/read-all", "POST"),
  react: (msgId: string, emoji: string) => req<any>(`/chat/messages/${msgId}`, "PATCH", { emoji }),
  deleteMsg: (msgId: string, scope: "me" | "everyone") => req<any>(`/chat/messages/${msgId}?scope=${scope}`, "DELETE"),
  reportMsg: (msgId: string, reason: string, note?: string) => req<any>(`/chat/messages/${msgId}`, "POST", { reason, note }),
  requestNumber: (id: string) => req<any>(`/chat/threads/${id}/number`, "POST", { action: "request" }),
  numberRespond: (id: string, allow: boolean) => req<any>(`/chat/threads/${id}/number`, "POST", { action: "respond", allow }),
  proposeVisit: (id: string, scheduledAt: string) => req<any>(`/chat/threads/${id}/visit`, "POST", { scheduledAt }),
  continuity: (id: string, answer: "interested" | "not_interested" | "visit_fixed") => req<any>(`/chat/threads/${id}/continuity`, "POST", { answer }),
  block: (id: string, action: "block" | "unblock") => req<any>(`/chat/threads/${id}/block`, "POST", { action }),
  reportUser: (id: string, reason: string, note?: string) => req<any>(`/chat/threads/${id}/block`, "POST", { action: "report", reason, note }),
  setState: (id: string, patch: { pinned?: boolean; muted?: boolean; archived?: boolean }) => req<any>(`/chat/threads/${id}/state`, "PATCH", patch),
  deleteThread: (id: string) => req<any>(`/chat/threads/${id}/state`, "DELETE"),
  templates: () => req<any>("/chat/templates", "GET"),
  templateCreate: (body: string) => req<any>("/chat/templates", "POST", { body }),
  templateUpdate: (tid: string, body: string) => req<any>(`/chat/templates/${tid}`, "PATCH", { body }),
  templateDelete: (tid: string) => req<any>(`/chat/templates/${tid}`, "DELETE"),
};

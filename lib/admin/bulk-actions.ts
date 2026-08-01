import "server-only";
import { registerBulkActions } from "./bulk";
import { grantTrial, sendAdminMessage, suspendUser } from "./users";
import { deleteListing, hideListing } from "./listings-master";
import { moderate } from "@/lib/listings/moderation";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The bulk bars the design draws, registered against the engine P1b built.
 *
 * A10 (template 1013): Send message · Grant trial · Suspend — "Bulk actions
 * are logged".
 * A12 (template 1071): Hide · Approve · Delete (Super) — "Max 20 · logged".
 *
 * Each handler is the SAME function the single-row action calls, so a bulk
 * suspend and a suspend from the panel cannot drift into two behaviours. Each
 * subject is applied independently and audited on its own row (lib/admin/bulk),
 * so "who suspended this account" always has a name and a time.
 */

const CAP = 20; // the design's own cap, printed on the A12 bar

registerBulkActions("users", {
  send_message: {
    label: "Send message",
    minRole: "staff",
    cap: 200, // a broadcast-shaped action; the design puts no cap on this one
    auditAction: "message",
    entityType: "user",
    apply: async (me, id, input) => {
      const res = await sendAdminMessage(
        [id],
        me,
        Array.isArray(input.channels) ? (input.channels as string[]) : ["in_app"],
        typeof input.subject === "string" ? input.subject : "",
        typeof input.body === "string" ? input.body : "",
      );
      if (!res.ok) throw new Error(res.message ?? res.reason);
      return { label: res.label, summary: res.summary, diff: res.diff };
    },
  },
  grant_trial: {
    label: "Grant trial",
    minRole: "admin",
    cap: CAP,
    auditAction: "grant",
    entityType: "user",
    apply: async (me, id, input) => {
      const c = (input.contents ?? {}) as Record<string, unknown>;
      const int = (v: unknown) => (typeof v === "number" && v >= 0 ? Math.min(50, Math.floor(v)) : 0);
      const res = await grantTrial(
        id,
        me,
        {
          listings: int(c.listings),
          requirements: int(c.requirements),
          proposals: int(c.proposals),
          projects: int(c.projects),
        },
        typeof input.durationDays === "number" ? input.durationDays : 14,
        typeof input.reason === "string" ? input.reason : "",
        typeof input.note === "string" ? input.note : null,
      );
      if (!res.ok) throw new Error(res.message ?? res.reason);
      return { label: res.label, summary: res.summary, diff: res.diff };
    },
  },
  suspend: {
    label: "Suspend",
    minRole: "admin",
    cap: CAP,
    auditAction: "suspend",
    entityType: "user",
    apply: async (me, id, input) => {
      const days = typeof input.days === "number" && input.days > 0 ? Math.floor(input.days) : null;
      const res = await suspendUser(
        id,
        me,
        days,
        typeof input.reason === "string" ? input.reason : "",
      );
      if (!res.ok) throw new Error(res.message ?? res.reason);
      return { label: res.label, summary: res.summary, diff: res.diff };
    },
  },
});

/** A12's rows can be a listing OR a project, so each handler resolves which. */
async function kindOf(id: string): Promise<"listing" | "project"> {
  const db = createServiceClient();
  const { data } = await db.from("listings").select("id").eq("id", id).maybeSingle();
  return data ? "listing" : "project";
}

registerBulkActions("listings-master", {
  hide: {
    label: "Hide",
    minRole: "admin",
    cap: CAP,
    auditAction: "hide",
    entityType: "listing",
    apply: async (me, id, input) => {
      const res = await hideListing(
        await kindOf(id),
        id,
        me,
        typeof input.reason === "string" ? input.reason : null,
      );
      if (!res.ok) throw new Error(res.message ?? res.reason);
      return { label: res.label, summary: res.summary, diff: res.diff };
    },
  },
  approve: {
    label: "Approve",
    minRole: "staff",
    cap: CAP,
    auditAction: "approve",
    entityType: "listing",
    apply: async (me, id) => {
      const kind = await kindOf(id);
      if (kind === "project") {
        // `moderate()` covers listings and requirements only — a project has no
        // approval path anywhere in the app yet (recorded in
        // docs/PENDING-INTEGRATIONS.md). Saying so per subject is better than
        // a bulk action that silently skips every builder row.
        throw new Error("Projects have no approval path yet");
      }
      const res = await moderate("listing", id, me.id, { action: "approve", notes: null, reason: null });
      if (!res.ok) throw new Error(res.reason);
      return { label: "Listing", summary: "Approved from the bulk bar" };
    },
  },
  delete: {
    label: "Delete",
    minRole: "super", // template 1071 — gatedBtn('Delete','danger',…,'super')
    cap: CAP,
    auditAction: "delete",
    entityType: "listing",
    apply: async (me, id, input) => {
      const res = await deleteListing(
        await kindOf(id),
        id,
        me,
        typeof input.reason === "string" ? input.reason : null,
      );
      if (!res.ok) throw new Error(res.message ?? res.reason);
      return { label: res.label, summary: res.summary, diff: res.diff };
    },
  },
});

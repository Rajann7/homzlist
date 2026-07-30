import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { signedReadUrl } from "@/lib/storage";
import { ageLabel } from "./risk";
import { sopItems, verificationRejectReasons, type SopItem } from "./reviewConfig";

/**
 * A7 — Verification queue (Doc5 A7, Doc3 §1.5).
 *
 * `verifications.status = 'approved'` IS the badge: eleven places across the feed,
 * chat, leads, proposals and profile read that row to draw a tick. So this screen
 * is not a workflow that later writes a badge somewhere — approving here is the
 * grant, and revoking here removes it everywhere on the next request.
 *
 * `phone` never appears. It is verified at registration and has no document to
 * look at; a queue of phone rows an admin cannot act on is noise.
 */

export const VERIFY_TABS = [
  { key: "pending", label: "Pending", status: "pending" },
  { key: "approved", label: "Approved", status: "approved" },
  { key: "rejected", label: "Rejected", status: "rejected" },
  { key: "revoked", label: "Revoked", status: "revoked" },
] as const;

export type VerifyTab = (typeof VERIFY_TABS)[number]["key"];

export interface VerificationRow {
  id: string;
  profileId: string;
  userName: string;
  initials: string;
  role: string | null;
  /** "ID" / "RERA" — the design's Level column. */
  level: "id" | "rera";
  levelLabel: string;
  status: string;
  statusLabel: string;
  submittedLabel: string | null;
  /** "2 files" — how many documents came with it. */
  docsLabel: string;
  docCount: number;
  hours: number;
}

export interface VerificationDetail extends VerificationRow {
  /** Short-lived signed URL — the object stays private (Doc9 §17). */
  docUrl: string | null;
  docType: string | null;
  /** RERA only. */
  reraNumber: string | null;
  /** The state RERA portal for the user's city, from master data. */
  reraPortalUrl: string | null;
  validTill: string | null;
  /** ID only — masked, never the full number (Doc9 §17). */
  maskedNumber: string | null;
  checklist: SopItem[];
  rejectReasons: string[];
  reason: string | null;
  reviewedBy: string | null;
  reviewedLabel: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Verified",
  rejected: "Rejected",
  revoked: "Revoked",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function roleLabel(role: string | null): string | null {
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : null;
}

/**
 * `verifications` stores one `doc_key`. Rather than invent the number the design
 * shows ("2 files"), this reports what is actually attached.
 *
 * `'pending-upload'` is a PLACEHOLDER the submit flow writes before the file
 * lands, and every seeded row carries it. Counting it as a file made the queue
 * promise a reviewer a document that does not exist — so it is explicitly not
 * one, and the sheet says the request has nothing to look at yet.
 */
const NO_DOC_KEYS = new Set(["pending-upload", "pending", ""]);

export function hasRealDoc(docKey: string | null): boolean {
  return Boolean(docKey && !NO_DOC_KEYS.has(docKey));
}

function docsLabel(docKey: string | null): { label: string; count: number } {
  if (!hasRealDoc(docKey)) return { label: "Awaiting upload", count: 0 };
  return { label: "1 file", count: 1 };
}

/** Counts for all four tabs in one pass, so the tab strip is never a guess. */
export async function verificationCounts(): Promise<Record<string, number>> {
  const db = createServiceClient();
  const out: Record<string, number> = {};
  await Promise.all(
    VERIFY_TABS.map(async (t) => {
      const { count } = await db
        .from("verifications")
        .select("id", { count: "exact", head: true })
        .eq("status", t.status)
        .in("level", ["id", "rera"]);
      out[t.key] = count ?? 0;
    }),
  );
  return out;
}

export async function verificationQueue(tab: VerifyTab, limit = 100): Promise<VerificationRow[]> {
  const db = createServiceClient();
  const spec = VERIFY_TABS.find((t) => t.key === tab) ?? VERIFY_TABS[0];

  const { data } = await db
    .from("verifications")
    .select("id, profile_id, level, status, doc_key, doc_type, submitted_at, reviewed_at, created_at")
    .eq("status", spec.status)
    .in("level", ["id", "rera"])
    // Oldest first: verification review is FIFO (there is no risk score for a
    // document — the score in Doc3 §1.4 is about listings).
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  const ids = [...new Set(rows.map((r) => r.profile_id as string))];
  const { data: profiles } = await db.from("profiles").select("id, name, role").in("id", ids);
  const byId = new Map(((profiles ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, p]));

  return rows.map((r) => {
    const p = byId.get(r.profile_id as string);
    const name = (p?.name as string) || "Unnamed";
    const stamp = (r.submitted_at as string) ?? (r.created_at as string) ?? null;
    const docs = docsLabel((r.doc_key as string) ?? null);
    const level = r.level as "id" | "rera";

    return {
      id: r.id as string,
      profileId: r.profile_id as string,
      userName: name,
      initials: initialsOf(name),
      role: roleLabel((p?.role as string) ?? null),
      level,
      levelLabel: level === "rera" ? "RERA" : "ID",
      status: r.status as string,
      statusLabel: STATUS_LABEL[r.status as string] ?? (r.status as string),
      submittedLabel: stamp ? ageLabel(stamp) : null,
      docsLabel: docs.label,
      docCount: docs.count,
      hours: stamp ? Math.floor((Date.now() - new Date(stamp).getTime()) / 3_600_000) : 0,
    };
  });
}

/**
 * "XXXX XXXX 4521" — the design's masked ID. Only the last four digits reach the
 * panel; the rest never leaves the server, because a reviewer confirming a
 * document does not need the whole number and a leaked payload cannot be undone.
 */
function maskIdNumber(docType: string | null, raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return "Unreadable number on file";
  const tail = digits.slice(-4);
  const groups = docType?.toLowerCase().includes("aadhaar") ? "XXXX XXXX " : "XXXX";
  return `${groups}${tail}`;
}

export async function verificationDetail(id: string): Promise<VerificationDetail | null> {
  const db = createServiceClient();
  const { data } = await db.from("verifications").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  const level = r.level as "id" | "rera";
  if (level !== "id" && level !== "rera") return null;

  const [{ data: prof }, checklist, reasons] = await Promise.all([
    db.from("profiles").select("id, name, role, city_id").eq("id", r.profile_id as string).maybeSingle(),
    sopItems(level === "rera" ? "verification_rera" : "verification_id"),
    verificationRejectReasons(level),
  ]);

  const p = (prof ?? {}) as Record<string, unknown>;
  const name = (p.name as string) || "Unnamed";
  const docKey = (r.doc_key as string) ?? null;
  const stamp = (r.submitted_at as string) ?? (r.created_at as string) ?? null;
  const docs = docsLabel(docKey);

  const [docUrl, portal, reviewer] = await Promise.all([
    hasRealDoc(docKey) ? signedReadUrl(docKey!, 300) : Promise.resolve(null),
    level === "rera" ? reraPortalFor(p.city_id as string | null) : Promise.resolve(null),
    r.reviewed_by ? staffName(r.reviewed_by as string) : Promise.resolve(null),
  ]);

  return {
    id: r.id as string,
    profileId: r.profile_id as string,
    userName: name,
    initials: initialsOf(name),
    role: roleLabel((p.role as string) ?? null),
    level,
    levelLabel: level === "rera" ? "RERA" : "ID",
    status: r.status as string,
    statusLabel: STATUS_LABEL[r.status as string] ?? (r.status as string),
    submittedLabel: stamp ? ageLabel(stamp) : null,
    docsLabel: docs.label,
    docCount: docs.count,
    hours: stamp ? Math.floor((Date.now() - new Date(stamp).getTime()) / 3_600_000) : 0,
    docUrl,
    docType: (r.doc_type as string) ?? null,
    reraNumber: level === "rera" ? ((r.rera_number as string) ?? null) : null,
    reraPortalUrl: portal,
    validTill: (r.valid_till as string) ?? null,
    // The ID number is not captured at upload today (only the document itself),
    // so this is null on every existing row and A7 says so rather than printing a
    // mask over nothing. Tracked in docs/PENDING-INTEGRATIONS.md.
    maskedNumber: level === "id" ? maskIdNumber((r.doc_type as string) ?? null, (r.rera_number as string) ?? null) : null,
    checklist,
    rejectReasons: reasons,
    reason: (r.reason as string) ?? null,
    reviewedBy: (r.reviewed_by as string) ?? null,
    reviewedLabel: r.reviewed_at
      ? `${reviewer ?? "an admin"} · ${ageLabel(r.reviewed_at as string)}`
      : null,
  };
}

async function staffName(profileId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("staff").select("display_name, email").eq("profile_id", profileId).maybeSingle();
  if (!data) return null;
  return ((data.display_name as string) || (data.email as string)) ?? null;
}

/**
 * The state's RERA portal, walked up from the user's city through `locations`.
 * The design draws "Open Gujarat RERA portal ↗", so the URL has to be per-state
 * config rather than one hardcoded link (CLAUDE.md rule 7). Null when the state
 * has no portal recorded — the link is then not drawn at all, instead of sending
 * a reviewer somewhere wrong.
 */
async function reraPortalFor(cityId: string | null): Promise<string | null> {
  if (!cityId) return null;
  const db = createServiceClient();

  let currentId: string | null = cityId;
  for (let hop = 0; hop < 5 && currentId; hop++) {
    const { data } = await db
      .from("locations")
      .select("id, parent_id, level, rera_portal_url")
      .eq("id", currentId)
      .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    if (row.rera_portal_url) return row.rera_portal_url as string;
    currentId = (row.parent_id as string) ?? null;
  }
  return null;
}

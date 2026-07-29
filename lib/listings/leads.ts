import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { profileCompleteness } from "./proposals";

/**
 * Leads pipeline (Doc2 §10.4, Doc7 §103-105).
 *
 * Broker/Builder see the full pipeline (stages + summary + trust); Owner sees a
 * simplified list — decided by ROLE server-side, never a client flag. Leads are
 * seeded + manually stage-managed here; auto-population from chat inquiries and
 * visit outcomes is Module 6 (tracked in PENDING-INTEGRATIONS.md), with the
 * visit-outcome → stage nudge already wired in visits.ts.
 */

const db = () => createServiceClient();

export const STAGES = ["new", "contacted", "visit", "negotiation", "closed_won", "closed_lost"] as const;
export type Stage = (typeof STAGES)[number];

export interface LeadRow {
  id: string;
  owner_id: string;
  lead_profile_id: string;
  listing_id: string | null;
  requirement_id: string | null;
  project_id: string | null;
  source: LeadSource;
  stage: Stage;
  last_activity: string | null;
  last_activity_at: string;
  notes: { text: string; at: string }[];
  is_relevant: boolean;
  created_at: string;
}

/** Where a lead came from — 'project' added in 0081 (see SOURCE_LABEL). */
export type LeadSource = "inquiry" | "proposal" | "visit" | "project";

/**
 * The spec's three lead families, in the words it uses. A lead's family is a
 * REAL column now that accepting an inquiry/proposal files the row with its own
 * source — before 0081 every project lead was recorded as an 'inquiry' and the
 * three were indistinguishable in the pipeline and in the export.
 */
export const SOURCE_LABEL: Record<LeadSource, string> = {
  inquiry: "Property lead",
  proposal: "Requirement proposal",
  project: "Project lead",
  visit: "Site visit",
};

export interface LeadView {
  id: string;
  stage: Stage;
  source: LeadRow["source"];
  /** "Property lead" / "Requirement proposal" / "Project lead" — the spec's families. */
  sourceLabel: string;
  lastActivity: string | null;
  lastActivityAt: string;
  notes: { text: string; at: string }[];
  lead: {
    name: string;
    role: string | null;
    verified: { phone: boolean; id: boolean; rera: boolean };
    memberSince: string;
    profilePct: number;
  };
  property: { id: string; title: string | null; priceLabel: string; areaLabel: string | null; coverUrl: string | null } | null;
  /** The chat grown from this lead's origin inquiry/proposal, if any — opens the thread. */
  threadId: string | null;
}

export interface LeadsPayload {
  ownerVariant: boolean;                 // Owner → simplified list
  leads: LeadView[];
  stageCounts: { key: "all" | Stage; label: string; count: number }[];
  summary: { total: number; newThisWeek: number; conversionPct: number | null };
}

const STAGE_LABEL: Record<Stage, string> = {
  new: "New", contacted: "Contacted", visit: "Visit", negotiation: "Negotiation",
  closed_won: "Closed", closed_lost: "Closed",
};

/**
 * Leads count for the profile stats strip (P9 S1). Same filter the Leads screen
 * uses (`is_relevant`), so the tile and the pipeline can never disagree. Until
 * Module 5 this stat was a hardcoded `0` in /api/v1/profile/me — a real table
 * exists now, so it is a real query (CLAUDE.md rule 12).
 */
export async function countProfileLeads(ownerId: string): Promise<number> {
  const { count } = await db()
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("is_relevant", true);
  return count ?? 0;
}

export async function listLeads(ownerId: string, role: string | null): Promise<LeadsPayload> {
  const { data } = await db()
    .from("leads")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_relevant", true)
    .order("last_activity_at", { ascending: false });
  const rows = (data ?? []) as LeadRow[];

  const leadIds = [...new Set(rows.map((r) => r.lead_profile_id))];
  const listingIds = rows.map((r) => r.listing_id).filter((x): x is string => Boolean(x));
  const [{ data: profs }, { data: vers }, { data: listings }] = await Promise.all([
    leadIds.length ? db().from("profiles").select("id,name,role,bio,photo_url,email,city_id,created_at").in("id", leadIds) : Promise.resolve({ data: [] as unknown[] }),
    leadIds.length ? db().from("verifications").select("profile_id,level,status").in("profile_id", leadIds) : Promise.resolve({ data: [] as unknown[] }),
    listingIds.length ? db().from("listings").select("id,title,price_paise,price_on_request,area_label,cover_url").in("id", listingIds) : Promise.resolve({ data: [] as unknown[] }),
  ]);
  // Resolve each lead's chat so "Message" opens the real thread instead of a
  // toast. Owner-scoped, so no foreign thread leaks. Requirement-born leads
  // (proposals) are keyed on requirement_id — they used to get `threadId: null`
  // unconditionally, so every proposal lead in the pipeline had a dead button.
  const { data: threads } = await db()
    .from("chat_threads")
    .select("id,listing_id,requirement_id,buyer_id")
    .eq("poster_id", ownerId);
  const threadMap = new Map<string, string>();
  for (const t of ((threads ?? []) as { id: string; listing_id: string | null; requirement_id: string | null; buyer_id: string }[])) {
    if (t.listing_id) threadMap.set(`l:${t.listing_id}:${t.buyer_id}`, t.id);
    else if (t.requirement_id) threadMap.set(`r:${t.requirement_id}:${t.buyer_id}`, t.id);
  }
  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const verMap = new Map<string, { phone: boolean; id: boolean; rera: boolean }>();
  for (const v of (vers ?? []) as { profile_id: string; level: string; status: string }[]) {
    const cur = verMap.get(v.profile_id) ?? { phone: false, id: false, rera: false };
    if (v.status === "approved") (cur as any)[v.level] = true;
    verMap.set(v.profile_id, cur);
  }
  const listMap = new Map((listings ?? []).map((l: any) => [l.id, l]));

  const leads: LeadView[] = rows.map((r) => {
    const p: any = profMap.get(r.lead_profile_id) ?? {};
    const l: any = r.listing_id ? listMap.get(r.listing_id) : null;
    return {
      id: r.id,
      stage: r.stage,
      source: r.source,
      sourceLabel: SOURCE_LABEL[r.source] ?? SOURCE_LABEL.inquiry,
      lastActivity: r.last_activity,
      lastActivityAt: r.last_activity_at,
      notes: r.notes ?? [],
      lead: {
        name: p.name ?? "HomzList user",
        role: p.role ?? null,
        verified: verMap.get(r.lead_profile_id) ?? { phone: false, id: false, rera: false },
        memberSince: memberSince(p.created_at),
        profilePct: profileCompleteness(p),
      },
      property: l
        ? { id: l.id, title: l.title, priceLabel: l.price_on_request ? "Price on request" : priceLabel(l.price_paise), areaLabel: l.area_label, coverUrl: l.cover_url }
        : null,
      threadId: r.listing_id
        ? threadMap.get(`l:${r.listing_id}:${r.lead_profile_id}`) ?? null
        : r.requirement_id
          ? threadMap.get(`r:${r.requirement_id}:${r.lead_profile_id}`) ?? null
          : null,
    };
  });

  // Stage counts (segmented bar). "closed" merges won+lost for the chip count.
  const count = (pred: (r: LeadRow) => boolean) => rows.filter(pred).length;
  const stageCounts: LeadsPayload["stageCounts"] = [
    { key: "all", label: "All", count: rows.length },
    { key: "new", label: "New", count: count((r) => r.stage === "new") },
    { key: "contacted", label: "Contacted", count: count((r) => r.stage === "contacted") },
    { key: "visit", label: "Visit", count: count((r) => r.stage === "visit") },
    { key: "negotiation", label: "Negotiation", count: count((r) => r.stage === "negotiation") },
    { key: "closed_won", label: "Closed", count: count((r) => r.stage === "closed_won" || r.stage === "closed_lost") },
  ];

  const weekAgo = Date.now() - 7 * 86_400_000;
  const newThisWeek = rows.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length;
  const closedWon = count((r) => r.stage === "closed_won");
  const conversionPct = rows.length ? Math.round((closedWon / rows.length) * 100) : 0;

  return {
    ownerVariant: role === "owner",
    leads,
    stageCounts,
    summary: {
      total: rows.length,
      newThisWeek,
      // Conversion is a Broker/Builder-only stat (design S2).
      conversionPct: role === "owner" ? null : conversionPct,
    },
  };
}

async function ownLead(id: string, ownerId: string): Promise<LeadRow | null> {
  const { data } = await db().from("leads").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  return (data as LeadRow) ?? null;
}

export async function moveStage(id: string, ownerId: string, stage: Stage, note: string | null): Promise<boolean> {
  const lead = await ownLead(id, ownerId);
  if (!lead) return false;
  const notes = note?.trim() ? [...(lead.notes ?? []), { text: note.trim().slice(0, 500), at: new Date().toISOString() }] : lead.notes;
  const { data } = await db()
    .from("leads")
    .update({ stage, last_activity: `Moved to ${STAGE_LABEL[stage]}`, last_activity_at: new Date().toISOString(), notes })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

export async function addLeadNote(id: string, ownerId: string, text: string): Promise<boolean> {
  const lead = await ownLead(id, ownerId);
  if (!lead || !text.trim()) return false;
  const notes = [...(lead.notes ?? []), { text: text.trim().slice(0, 500), at: new Date().toISOString() }];
  const { data } = await db().from("leads").update({ notes }).eq("id", id).eq("owner_id", ownerId).select("id").maybeSingle();
  return Boolean(data);
}

export async function markLeadNotRelevant(id: string, ownerId: string): Promise<boolean> {
  const { data } = await db().from("leads").update({ is_relevant: false }).eq("id", id).eq("owner_id", ownerId).select("id").maybeSingle();
  return Boolean(data);
}

// ---- CSV export (Doc7 §105) ------------------------------------------------

export const CSV_FIELDS = ["name", "phone", "property", "source", "stage", "date", "last_activity"] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

/**
 * Build the CSV server-side. Phone is included only when the field is requested;
 * it comes from the lead's profile (the owner already holds these as their own
 * leads). Values are CSV-escaped so a name with a comma can't shift columns.
 */
export async function exportLeadsCsv(ownerId: string, fields: CsvField[]): Promise<string> {
  const cols = fields.length ? fields.filter((f) => CSV_FIELDS.includes(f)) : [...CSV_FIELDS];
  const { data } = await db()
    .from("leads")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_relevant", true)
    .order("last_activity_at", { ascending: false });
  const rows = (data ?? []) as LeadRow[];

  const leadIds = [...new Set(rows.map((r) => r.lead_profile_id))];
  const listingIds = rows.map((r) => r.listing_id).filter((x): x is string => Boolean(x));
  const [{ data: profs }, { data: listings }] = await Promise.all([
    leadIds.length ? db().from("profiles").select("id,name,phone").in("id", leadIds) : Promise.resolve({ data: [] as unknown[] }),
    listingIds.length ? db().from("listings").select("id,title,area_label").in("id", listingIds) : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const listMap = new Map((listings ?? []).map((l: any) => [l.id, l]));

  const header = cols.map((c) => CSV_HEADER[c]);
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const p: any = profMap.get(r.lead_profile_id) ?? {};
    const l: any = r.listing_id ? listMap.get(r.listing_id) : null;
    const cell: Record<CsvField, string> = {
      name: p.name ?? "",
      phone: p.phone ?? "",
      property: l ? [l.title, l.area_label].filter(Boolean).join(", ") : "",
      source: SOURCE_LABEL[r.source] ?? SOURCE_LABEL.inquiry,
      stage: STAGE_LABEL[r.stage],
      date: new Date(r.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
      last_activity: r.last_activity ?? "",
    };
    lines.push(cols.map((c) => csvCell(cell[c])).join(","));
  }
  return lines.join("\r\n");
}

const CSV_HEADER: Record<CsvField, string> = {
  name: "Name", phone: "Phone", property: "Property", source: "Source", stage: "Stage", date: "Date", last_activity: "Last activity",
};

function csvCell(v: string): string {
  // Formula-injection guard (Doc9 injection catalog): a cell a spreadsheet would
  // treat as a formula (leading = + - @ tab CR) is neutralised with a leading
  // apostrophe so a lead's name like `=cmd|…` can't execute on open.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function priceLabel(paise: number | null): string {
  if (paise === null) return "—";
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${+(r / 1_00_00_000).toFixed(2)} Cr`;
  if (r >= 1_00_000) return `₹${+(r / 1_00_000).toFixed(2)} L`;
  return `₹${Math.round(r)}`;
}

function memberSince(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

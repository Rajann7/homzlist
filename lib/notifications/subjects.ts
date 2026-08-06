import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Copy helpers shared by every notification producer.
 *
 * The P11 rows name the thing that happened ("your 3 BHK Flat, Mavdi") and show
 * its photo. That title and that thumbnail are real columns, fetched here once,
 * so no producer invents a label and no row ships a placeholder image.
 */

const db = () => createServiceClient();

export interface SubjectBrief {
  title: string;
  thumbUrl: string | null;
}

export async function listingBrief(listingId: string | null | undefined): Promise<SubjectBrief> {
  if (!listingId) return { title: "your listing", thumbUrl: null };
  const { data } = await db().from("listings").select("title,area_label,cover_url").eq("id", listingId).maybeSingle();
  const r = data as { title?: string; area_label?: string; cover_url?: string } | null;
  if (!r) return { title: "your listing", thumbUrl: null };
  const title = [r.title, r.area_label].filter(Boolean).join(", ") || "your listing";
  return { title, thumbUrl: r.cover_url ?? null };
}

export async function projectBrief(projectId: string | null | undefined): Promise<SubjectBrief> {
  if (!projectId) return { title: "your project", thumbUrl: null };
  const { data } = await db().from("projects").select("name,area_label,cover_url").eq("id", projectId).maybeSingle();
  const r = data as { name?: string; area_label?: string; cover_url?: string } | null;
  if (!r) return { title: "your project", thumbUrl: null };
  return { title: [r.name, r.area_label].filter(Boolean).join(", ") || "your project", thumbUrl: r.cover_url ?? null };
}

export async function requirementBrief(requirementId: string | null | undefined): Promise<SubjectBrief> {
  if (!requirementId) return { title: "your requirement", thumbUrl: null };
  const { data } = await db()
    .from("requirements")
    .select("bhk,type_code,area_label,budget_min_paise,budget_max_paise")
    .eq("id", requirementId)
    .maybeSingle();
  const r = data as any;
  if (!r) return { title: "your requirement", thumbUrl: null };
  const bits = [r.bhk ? `${r.bhk} BHK` : null, r.area_label, budgetLabel(r.budget_min_paise, r.budget_max_paise)].filter(Boolean);
  return { title: bits.join(", ") || "your requirement", thumbUrl: null };
}

/**
 * The same brief WITHOUT the budget — for notifications that go to someone who
 * is not the poster.
 *
 * `requirementBrief` is right for the poster's own reminders ("your requirement
 * expires in 5 days"), where the budget is their own. It was also being used
 * for the "New requirement matches your area" alert, which fans out to every
 * broker and builder in the city — so an unpaid recipient was handed, in a push
 * notification, the exact figure that every screen in the app strips
 * server-side behind the ₹2,999 wall (Doc9 §17).
 */
export async function requirementBriefPreview(requirementId: string | null | undefined): Promise<SubjectBrief> {
  if (!requirementId) return { title: "a new requirement", thumbUrl: null };
  const { data } = await db()
    .from("requirements")
    .select("bhk,kind,area_label")
    .eq("id", requirementId)
    .maybeSingle();
  const r = data as { bhk: number | null; kind: string; area_label: string | null } | null;
  if (!r) return { title: "a new requirement", thumbUrl: null };
  const bits = [r.bhk ? `${r.bhk} BHK` : null, r.kind === "rent" ? "Rent" : "Buy", r.area_label].filter(Boolean);
  return { title: bits.join(", ") || "a new requirement", thumbUrl: null };
}

export async function nameOf(profileId: string | null | undefined): Promise<string> {
  if (!profileId) return "Someone";
  const { data } = await db().from("profiles").select("name").eq("id", profileId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? "Someone";
}

/** ₹85 L / ₹1.2 Cr — the Doc2 §15 money format, from integer paise. */
export function rupees(paise: number | null | undefined): string {
  if (paise == null) return "₹—";
  const r = Math.round(paise / 100);
  if (r >= 10_000_000) return `₹${trim(r / 10_000_000)} Cr`;
  if (r >= 100_000) return `₹${trim(r / 100_000)} L`;
  return `₹${r.toLocaleString("en-IN")}`;
}

/** Plain rupee amount for payments — "₹2,999", not "₹3 K". */
export function rupeesExact(paise: number | null | undefined): string {
  if (paise == null) return "₹—";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function trim(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, "");
}

export function budgetLabel(minPaise: number | null, maxPaise: number | null): string | null {
  if (minPaise == null && maxPaise == null) return null;
  if (minPaise != null && maxPaise != null) {
    // "₹40–60 L" — the shared unit is written once, exactly like the design.
    const a = rupees(minPaise);
    const b = rupees(maxPaise);
    const unitA = a.replace(/[\d.,₹\s]/g, "");
    const unitB = b.replace(/[\d.,₹\s]/g, "");
    if (unitA && unitA === unitB) return `${a.replace(` ${unitA}`, "")}–${b}`;
    return `${a}–${b}`;
  }
  return minPaise != null ? `${rupees(minPaise)}+` : `up to ${rupees(maxPaise)}`;
}

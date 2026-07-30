import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { fillPlaceholders } from "./markdown";

/**
 * CMS / legal reader data (Doc7 §12 #173–176).
 *
 * Reads are service-role because every one of these tables is RLS-denied by
 * default; the filter to `is_published` here IS the authorization — an
 * unpublished draft must never reach a reader, guest or not.
 */

export interface LegalSettings {
  entity_name: string;
  entity_type: string;
  registered_address: string;
  reg_no: string;
  gstin: string;
  support_email: string;
  grievance_name: string;
  grievance_email: string;
  grievance_phone: string;
  grievance_hours: string;
  jurisdiction_city: string;
  jurisdiction_state: string;
  ack_hours: number;
  resolution_days: number;
  liability_months: number;
}

export interface LegalIndexRow {
  slug: string;
  title: string;
  icon: string;
  version: string;
  effectiveDate: string | null;
}

export interface LegalPage {
  slug: string;
  title: string;
  body: string;
  version: string;
  kind: string;
  reader: string;
  effectiveDate: string | null;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  requiresReacceptance: boolean;
  versionCount: number;
  settings: LegalSettings;
}

export interface LegalVersion {
  version: string;
  effectiveDate: string | null;
  note: string | null;
  isMaterial: boolean;
  isCurrent: boolean;
  createdAt: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Jan 2026" — the date format every P12 screen uses. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export async function getLegalSettings(): Promise<LegalSettings> {
  const db = createServiceClient();
  const { data } = await db.from("legal_settings").select("*").eq("id", true).maybeSingle();
  return (data ?? {}) as LegalSettings;
}

/** The S3 legal index — every published legal doc, in admin-set order. */
export async function getLegalIndex(): Promise<LegalIndexRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("cms_pages")
    .select("slug, title, icon, version, effective_date")
    .eq("is_published", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r: Record<string, unknown>) => ({
    slug: r.slug as string,
    title: r.title as string,
    icon: (r.icon as string) ?? "file",
    version: r.version as string,
    effectiveDate: (r.effective_date as string) ?? null,
  }));
}

export async function getLegalPage(slug: string): Promise<LegalPage | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("cms_pages")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (!data) return null;

  const [{ count }, settings] = await Promise.all([
    db.from("cms_page_versions").select("id", { count: "exact", head: true }).eq("page_id", data.id),
    getLegalSettings(),
  ]);

  return {
    slug: data.slug,
    title: data.title,
    body: fillPlaceholders(data.body_md, settings as unknown as Record<string, string | number>),
    version: data.version,
    kind: data.kind ?? "legal",
    reader: data.reader ?? "longform",
    effectiveDate: data.effective_date ?? null,
    updatedAt: data.updated_at,
    seoTitle: data.seo_title ?? null,
    seoDescription: data.seo_description ?? null,
    requiresReacceptance: Boolean(data.requires_reacceptance),
    versionCount: count ?? 0,
    settings,
  };
}

/** Version history behind "View previous versions". Newest first. */
export async function getLegalVersions(slug: string): Promise<{ title: string; current: string; versions: LegalVersion[] } | null> {
  const db = createServiceClient();
  const { data: page } = await db
    .from("cms_pages")
    .select("id, title, version")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (!page) return null;

  const { data } = await db
    .from("cms_page_versions")
    .select("version, effective_date, note, is_material, created_at")
    .eq("page_id", page.id)
    .order("created_at", { ascending: false });

  return {
    title: page.title,
    current: page.version,
    versions: (data ?? []).map((v: Record<string, unknown>) => ({
      version: v.version as string,
      effectiveDate: (v.effective_date as string) ?? null,
      note: (v.note as string) ?? null,
      isMaterial: Boolean(v.is_material),
      isCurrent: v.version === page.version,
      createdAt: v.created_at as string,
    })),
  };
}

/** A single archived version, for reading an older text. */
export async function getLegalVersionBody(
  slug: string,
  version: string,
): Promise<{ title: string; version: string; effectiveDate: string | null; body: string; isCurrent: boolean } | null> {
  const db = createServiceClient();
  const { data: page } = await db
    .from("cms_pages")
    .select("id, title, version")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (!page) return null;
  const { data } = await db
    .from("cms_page_versions")
    .select("version, title, body_md, effective_date")
    .eq("page_id", page.id)
    .eq("version", version)
    .maybeSingle();
  if (!data) return null;
  const settings = await getLegalSettings();
  return {
    title: data.title ?? page.title,
    version: data.version,
    effectiveDate: data.effective_date ?? null,
    body: fillPlaceholders(data.body_md, settings as unknown as Record<string, string | number>),
    isCurrent: data.version === page.version,
  };
}

/**
 * Re-acceptance (Doc7 #176). A page flagged `requires_reacceptance` gates the app
 * until the signed-in user has an auth_consents row for THAT version. The gate is
 * computed here, server-side, on every request — never remembered in the browser.
 */
export interface PendingConsent {
  slug: string;
  title: string;
  version: string;
  effectiveDate: string | null;
  summary: string;
  highlights: string[];
  preview: string;
}

export async function getPendingConsents(profileId: string): Promise<PendingConsent[]> {
  const db = createServiceClient();
  const { data: pages } = await db
    .from("cms_pages")
    .select("slug, title, version, effective_date, body_md")
    .eq("is_published", true)
    .eq("requires_reacceptance", true)
    .order("sort_order", { ascending: true });
  if (!pages?.length) return [];

  const { data: consents } = await db
    .from("auth_consents")
    .select("kind, version")
    .eq("profile_id", profileId)
    .eq("accepted", true);
  const have = new Set((consents ?? []).map((c: Record<string, unknown>) => `${c.kind}:${c.version}`));

  const settings = await getLegalSettings();
  const out: PendingConsent[] = [];
  for (const p of pages) {
    if (have.has(`${p.slug}:${p.version}`)) continue;
    const body = fillPlaceholders(p.body_md, settings as unknown as Record<string, string | number>);
    // What changed comes from the version row's note; the dialog's bullet list is
    // the material change notes recorded for this version.
    const { data: v } = await db
      .from("cms_page_versions")
      .select("note")
      .eq("version", p.version)
      .limit(1)
      .maybeSingle();
    const note = (v?.note as string) ?? "";
    out.push({
      slug: p.slug,
      title: p.title,
      version: p.version,
      effectiveDate: p.effective_date ?? null,
      summary: note.split("\n")[0] || `We've updated our ${p.title}.`,
      highlights: note.split("\n").slice(1).filter(Boolean),
      preview: body,
    });
  }
  return out;
}

export async function recordConsent(
  profileId: string,
  slug: string,
  version: string,
  ipHash: string | null,
): Promise<void> {
  const db = createServiceClient();
  await db
    .from("auth_consents")
    .upsert(
      { profile_id: profileId, kind: slug, version, accepted: true, ip_hash: ipHash },
      { onConflict: "profile_id,kind,version" },
    );
}

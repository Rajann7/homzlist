import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";

/**
 * P12 S3 — the legal reader, its version history, and re-acceptance
 * (Doc4 §69, Doc7 §173–176, Doc10 implementation notes).
 *
 * Three things live here, and the third is the one that is easy to fake:
 *
 *  1. READ. `cms_pages` is the published page; `cms_page_versions` is every
 *     version, which is what "View previous versions" opens. Guests read both
 *     — these pages are public, SSR and indexable by design.
 *
 *  2. CONSENT. Accepting a page writes an `auth_consents` row keyed by page
 *     slug + version. Accepting is therefore per-VERSION, and a new version
 *     does not silently inherit the old acceptance.
 *
 *  3. THE INTERSTITIAL'S TRIGGER. `pendingReacceptance` asks the question the
 *     dialog exists to answer: are there published pages flagged
 *     `requires_reacceptance` whose CURRENT version this user has not accepted?
 *     If the answer were computed in the browser the dialog would be a
 *     suggestion; computed here it is a gate.
 */

const db = () => createServiceClient();

export interface LegalIndexRow {
  slug: string;
  title: string;
  icon: string;
  kind: string;
}

export interface LegalPage {
  slug: string;
  title: string;
  bodyMd: string;
  version: string;
  effectiveDate: string | null;
  updatedAt: string;
  reader: "longform" | "grievance";
  kind: string;
  seoTitle: string | null;
  seoDescription: string | null;
  requiresReacceptance: boolean;
  versionCount: number;
  /** Set only when an OLD version is being read, so the reader can say so. */
  isArchivedVersion?: boolean;
}

export interface LegalVersion {
  version: string;
  effectiveDate: string | null;
  note: string | null;
  isMaterial: boolean;
  createdAt: string;
  isCurrent: boolean;
}

export async function getLegalIndex(): Promise<LegalIndexRow[]> {
  const { data } = await db()
    .from("cms_pages")
    .select("slug, title, icon, kind")
    .eq("is_published", true)
    .order("sort_order");
  return (data ?? []) as LegalIndexRow[];
}

export async function getLegalPage(slug: string, version?: string | null): Promise<LegalPage | null> {
  const { data } = await db()
    .from("cms_pages")
    .select(
      "id, slug, title, body_md, version, effective_date, updated_at, reader, kind, seo_title, seo_description, requires_reacceptance",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (!data) return null;

  const p = data as {
    id: string; slug: string; title: string; body_md: string; version: string;
    effective_date: string | null; updated_at: string; reader: string; kind: string;
    seo_title: string | null; seo_description: string | null; requires_reacceptance: boolean;
  };

  const { count } = await db()
    .from("cms_page_versions")
    .select("id", { count: "exact", head: true })
    .eq("page_id", p.id);

  const base: LegalPage = {
    slug: p.slug,
    title: p.title,
    bodyMd: p.body_md,
    version: p.version,
    effectiveDate: p.effective_date,
    updatedAt: p.updated_at,
    reader: p.reader === "grievance" ? "grievance" : "longform",
    kind: p.kind,
    seoTitle: p.seo_title,
    seoDescription: p.seo_description,
    requiresReacceptance: p.requires_reacceptance,
    versionCount: count ?? 0,
  };

  if (!version || version === p.version) return base;

  const { data: v } = await db()
    .from("cms_page_versions")
    .select("version, title, body_md, effective_date, created_at")
    .eq("page_id", p.id)
    .eq("version", version)
    .maybeSingle();
  if (!v) return null;

  const old = v as { version: string; title: string; body_md: string; effective_date: string | null; created_at: string };
  return {
    ...base,
    title: old.title,
    bodyMd: old.body_md,
    version: old.version,
    effectiveDate: old.effective_date,
    updatedAt: old.created_at,
    isArchivedVersion: true,
  };
}

export async function getLegalVersions(slug: string): Promise<LegalVersion[]> {
  const { data: page } = await db().from("cms_pages").select("id, version").eq("slug", slug).maybeSingle();
  if (!page) return [];
  const p = page as { id: string; version: string };
  const { data } = await db()
    .from("cms_page_versions")
    .select("version, effective_date, note, is_material, created_at")
    .eq("page_id", p.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as {
    version: string; effective_date: string | null; note: string | null;
    is_material: boolean; created_at: string;
  }[]).map((v) => ({
    version: v.version,
    effectiveDate: v.effective_date,
    note: v.note,
    isMaterial: v.is_material,
    createdAt: v.created_at,
    isCurrent: v.version === p.version,
  }));
}

/* ══════════════════════════════════════════════════════ re-acceptance ═══ */

export interface PendingConsent {
  slug: string;
  title: string;
  version: string;
  /** The `> info:`/lead paragraph of the current version — the dialog's summary. */
  summary: string;
  /** The scrollable extract the dialog gates the Agree button behind. */
  extract: string;
  highlights: string[];
}

/**
 * Every published page flagged `requires_reacceptance` whose CURRENT version
 * this profile has not accepted. Empty array = nothing to show.
 */
export async function pendingReacceptance(profileId: string): Promise<PendingConsent[]> {
  const { data: pages } = await db()
    .from("cms_pages")
    .select("slug, title, version, body_md")
    .eq("is_published", true)
    .eq("requires_reacceptance", true)
    .order("sort_order");
  const list = (pages ?? []) as { slug: string; title: string; version: string; body_md: string }[];
  if (!list.length) return [];

  const { data: accepted } = await db()
    .from("auth_consents")
    .select("kind, version")
    .eq("profile_id", profileId)
    .eq("accepted", true)
    .in("kind", list.map((p) => p.slug));

  const have = new Set(
    ((accepted ?? []) as { kind: string; version: string }[]).map((a) => `${a.kind}@${a.version}`),
  );

  return list
    .filter((p) => !have.has(`${p.slug}@${p.version}`))
    .map((p) => {
      const lines = p.body_md.split("\n").map((l) => l.trim()).filter(Boolean);
      const lead = lines.find((l) => !l.startsWith("#") && !l.startsWith(">")) ?? "";
      const bullets = lines
        .filter((l) => l.startsWith("- ") || /^\d+[.)]\s/.test(l))
        .slice(0, 3)
        .map((l) => l.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/\*\*/g, ""));
      return {
        slug: p.slug,
        title: p.title,
        version: p.version,
        summary: lead.replace(/\*\*/g, "").slice(0, 240),
        // The dialog's scroll-to-enable box. Long enough that scrolling it is a
        // real act — the design gates the Agree button on reaching the end.
        extract: p.body_md.slice(0, 2600),
        highlights: bullets,
      };
    });
}

export interface AcceptOutcome {
  ok: boolean;
  reason?: "NOT_FOUND" | "VERSION_STALE";
  remaining?: number;
}

/**
 * Record acceptance of ONE page at its CURRENT version. The version is read
 * from the database rather than taken from the request, so a client cannot
 * accept version 1.0 to escape a v2.0 gate.
 */
export async function acceptLegal(
  profileId: string,
  slug: string,
  claimedVersion: string | null,
  ip: string,
): Promise<AcceptOutcome> {
  const { data } = await db()
    .from("cms_pages")
    .select("slug, version")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (!data) return { ok: false, reason: "NOT_FOUND" };
  const page = data as { slug: string; version: string };

  if (claimedVersion && claimedVersion !== page.version) return { ok: false, reason: "VERSION_STALE" };

  await db().from("auth_consents").insert({
    profile_id: profileId,
    kind: page.slug,
    version: page.version,
    accepted: true,
    ip_hash: createHash("sha256").update(`hz-consent:${ip}`).digest("hex").slice(0, 16),
  });

  const remaining = await pendingReacceptance(profileId);
  return { ok: true, remaining: remaining.length };
}

/**
 * The grievance reader's officer card. Doc10 leaves every one of these values
 * as a `[PLACEHOLDER]` for Rajan's advocate to fill, and the design draws
 * "Name: [Officer Name]" — so they are read from `branding_settings` when an
 * admin has filled them, and fall back to the Doc10 placeholders when not.
 * Nothing here is invented.
 */
export interface GrievanceOfficer {
  name: string;
  designation: string;
  email: string;
  address: string;
  phone: string | null;
  hours: string;
}

export async function getGrievanceOfficer(): Promise<GrievanceOfficer> {
  // `branding_settings` is key/value — the same rows A20 edits, so an admin
  // filling the officer's name here changes the public page immediately.
  const { data } = await db().from("branding_settings").select("key, value");
  const b = new Map(((data ?? []) as { key: string; value: string | null }[]).map((r) => [r.key, r.value]));
  const get = (k: string, fallback: string) => (b.get(k) || "").trim() || fallback;
  return {
    name: get("grievance_officer", "[GRIEVANCE OFFICER NAME]"),
    designation: get("grievance_designation", "Grievance Officer, [LEGAL ENTITY NAME]"),
    email: get("grievance_email", "[GRIEVANCE EMAIL]"),
    address: get("registered_address", "[REGISTERED ADDRESS, RAJKOT, GUJARAT]"),
    phone: get("grievance_phone", "[PHONE]"),
    hours: get("grievance_hours", "[Mon–Fri, 10:00–18:00 IST]"),
  };
}

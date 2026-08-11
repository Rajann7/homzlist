"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import type { ShowIf } from "./visibility";

/**
 * Client-side listings API. Same discipline as billing: this file asks the
 * server questions and renders answers. It holds no entitlement logic, no photo
 * caps, no validation verdicts of its own — those all belong to the server
 * (CLAUDE.md backend lock §1).
 */

import { normalizeImages } from "./image-client";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message_key?: string; [k: string]: unknown } };

async function req<T>(path: string, method: string, body?: unknown, opts?: { keepalive?: boolean }): Promise<ApiResult<T>> {
  try {
    const res = await apiFetch(`/api/v1${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      // For a request fired as the page is leaving (Call → tel: hands off to the
      // dialler). Without it the browser cancels the in-flight POST and the
      // builder's lead is simply lost — caught by the click walk, which saw
      // WhatsApp record a lead and Call record nothing.
      ...(opts?.keepalive ? { keepalive: true } : {}),
      // Every screen here re-reads the same URL right after mutating it (hide a
      // listing → GET its insights again). Without this the browser's HTTP
      // cache answers the second GET from the first one's response, so the
      // action succeeds in the database and the screen keeps showing the old
      // state — which reads as a dead button. Found live: "Hide" wrote
      // status=hidden and the badge stayed LIVE until a hard reload.
      cache: "no-store",
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

export interface TypeConfig {
  code: string;
  label: string;
  category: "residential" | "commercial" | "plot" | "pg";
  kinds: ("sell" | "rent")[];
  fields: string[];
  hidden: string[];
  /** Attribute keys the server refuses to accept empty, per type. */
  required: string[];
  /** Extras a RENT listing asks for — per type, so an office gets lease terms. */
  rentFields: string[];
  /** Extras a SELL listing asks for — the ownership document, the loan flag. */
  sellFields: string[];
  areaUnits: boolean;
}

/** A kind of builder scheme (migration 0062) — apartment, plotting, shops… */
export interface ProjectTypeConfig {
  code: string;
  label: string;
  category: "residential" | "commercial" | "plot" | "mixed";
  /** Unit names this scheme's "Add unit type" sheet offers. */
  unitTypes: string[];
  fields: string[];
  required: string[];
}

/** Field definitions keyed by name — the same shape `components/listings/fields` declares. */
export type FieldDefMap = Record<string, {
  key: string; label: string; control: any;
  options: { value: string; label: string }[];
  placeholder: string | null; hint: string | null;
  showIf: ShowIf | null;
  units: "land" | "built" | null;
  group: string | null;
}>;

export interface LocationNode {
  id: string;
  name: string;
  name_gu: string | null;
  level: string;
  pincode: string | null;
}

export interface Photo {
  id: string;
  url: string | null;
  altText: string | null;
  position: number;
  status: "uploading" | "processing" | "ready" | "failed";
  error: string | null;
  isCover: boolean;
}

export interface RequirementCard {
  id: string;
  kind: "sell" | "rent";
  kindLabel: string;
  typeCode: string;
  bhk: number | null;
  budgetLabel: string;
  areaLabel: string | null;
  urgency: string;
  urgencyLabel: string;
  notes: string | null;
  status: string;
  badge: { kind: string; label: string };
  isActive: boolean;
  rejectReason: string | null;
  daysLeft: number | null;
  createdOn: string | null;
  /** S4 list extras — present for live requirements (Doc7 §65). */
  proposals?: { total: number; newCount: number };
  matches?: { id: string; title: string | null; priceLabel: string; areaLabel: string | null; bhk: number | null; coverUrl: string | null; tier: string; tierLabel: string | null }[];
}

export interface MyListing {
  id: string;
  /**
   * What this row actually IS. The manager lists a builder's projects next to
   * properties (they share the screen and the card), and the two open different
   * routes — so the screen is told, it never guesses from the shape.
   */
  subjectKind?: "listing" | "project";
  title: string | null;
  price: string;
  areaLabel: string | null;
  coverUrl: string | null;
  photoCount: number;
  /** Listings only — a project has neither a property type nor a buy/rent kind. */
  typeCode?: string;
  kind?: string;
  status: string;
  availability: string | null;
  badge: { kind: string; label: string };
  reviewNotes: Record<string, string> | null;
  rejectReason: string | null;
  isLocked: boolean;
  canBoost: boolean;
  canReactivate: boolean;
  /**
   * Projects only. The server's verdict on the two lifecycle actions a project
   * supports, so the sheet and the endpoint can't disagree about what is
   * allowed (a listing carries the same rule inside `status`).
   */
  canHide?: boolean;
  canUnhide?: boolean;
  /** The 2-month prompt is waiting for an answer on this listing. */
  stillAvailableAsked?: boolean;
  /** Trash only — days before the purge cron removes it for good. */
  daysLeft?: number;
  /** Boosted right now — the PROMOTED chip on a profile tile (P9 S1). */
  promoted?: boolean;
  /** Where that boost is placed and what's left of it — server-computed. */
  boost?: { targetLabel: string; daysLeft: number } | null;
  /** Relevant inquiries on this listing (P9 S1 row). Listings only. */
  leads?: number;
  /**
   * Meta line on the profile row. Both from the row, neither derived here.
   * `bhk` is the stored option code ("3", "5+"), never a number.
   */
  bhk?: string | null;
  sqft?: number | null;
  createdOn: string | null;
}

/** A builder's project as the profile's Projects tab needs it (P9 S1). */
export interface MyProject {
  id: string;
  name: string;
  status: string;
  badge: { kind: string; label: string };
  /** Cheapest unit, or null while no unit carries a price. */
  priceFrom: string | null;
  areaLabel: string | null;
  coverUrl: string | null;
  buildStatusLabel: string | null;
  possessionLabel: string | null;
  totalUnits: number | null;
  availableUnits: number | null;
  /** The row's configuration line: "Apartments · 2, 3 BHK · 240 units". */
  projectTypeLabel?: string | null;
  units?: { unitType: string | null }[];
  photoCount?: number;
  /** RERA number, or the approved exemption — the same shape the detail uses. */
  rera?: { exempt: true; reason: string | null } | { exempt: false; number: string | null };
  promoted?: boolean;
  boost?: { targetLabel: string; daysLeft: number } | null;
}

/**
 * Project insights. ONE metric — leads (migration 0051). Views and shares were
 * briefly here and were removed: a builder's question is who wants the project,
 * not how many people scrolled past it.
 */
export interface ProjectInsights extends MyProject {
  promoted: boolean;
  canBoost: boolean;
  leads: number;
  boostFrom: string | null;
}

/** P9 S5 — Listing insights. Every field is the server's, none derived here. */
export interface ListingInsights extends MyListing {
  promoted: boolean;
  /** "Lifetime listing" / "Valid till 24 Apr 2027" — null if no plan slot. */
  planLabel: string | null;
  /** "12 Jan" — the date half of "Live since 12 Jan". */
  liveSince: string | null;
  liveDays: number | null;
  stats: { views: number; saves: number; shares: number; leads: number };
  /** The advice card, only when the observation behind it is actually true. */
  tip: { title: string; body: string } | null;
  /** Cheapest boost, priced from plan_catalog — "Boost — from ₹499". */
  boostFrom: string | null;
}

export const listingsApi = {
  config: () =>
    req<{
      role: string | null;
      types: TypeConfig[];
      /** Field definitions incl. every option list — server-owned (Doc2 §5.1). */
      fieldDefs: FieldDefMap;
      /** Titled blocks the form renders, in order (migration 0055). */
      fieldGroups: { key: string; label: string; sort_order: number }[];
      /** Builder-only: the kinds of scheme, and the fields each one asks for. */
      projectTypes: ProjectTypeConfig[];
      amenities: { code: string; label: string; category: string; categories: string[] }[];
      categories: { key: string; label: string }[];
      /** The area-unit master (migration 0068): code, label, and which rows offer it. */
      areaUnits: { code: string; label: string; unitSet: "land" | "built" | "both" }[];
    }>("/listings/config", "GET"),

  /**
   * One level of the cascade. `search` is passed through to the database — the
   * master is the full India Post directory, so a district can return several
   * hundred villages and the picker searches rather than scrolls.
   */
  locations: (level: string, parent?: string | null, search?: string | null) =>
    req<{ items: LocationNode[]; truncated: boolean }>(
      `/locations/children?level=${level}${parent ? `&parent=${parent}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`,
      "GET",
    ),
  /** Resolve nodes by id — used to redraw chips an edit form loaded as ids. */
  locationsByIds: (ids: string[]) =>
    req<{ items: LocationNode[] }>(`/locations/children?ids=${ids.join(",")}`, "GET"),
  /** The pincodes a city (or, more precisely, an area) covers — Doc2 §5.1. */
  pincodes: (cityId: string | null, areaId?: string | null) =>
    req<{ pincodes: string[] }>(
      `/locations/pincodes?${cityId ? `city=${cityId}` : ""}${areaId ? `&area=${areaId}` : ""}`,
      "GET",
    ),
  requestArea: (name: string, cityId: string | null) => req<{ requested: boolean }>("/locations/children", "POST", { name, cityId }),

  drafts: () => req<{ items: { id: string; title: string | null; updatedAt: string; expiresAt: string; payload: any }[]; max: number }>("/listings/drafts", "GET"),
  saveDraft: (payload: Record<string, unknown>, title?: string | null, id?: string) =>
    req<{ id: string }>("/listings/drafts", "POST", { payload, title, id }),
  deleteDraft: (id: string) => req<{ deleted: boolean }>(`/listings/draft/${id}`, "DELETE"),

  create: (payload: Record<string, unknown>) =>
    req<{ listing: { id: string }; warnings: Record<string, string> }>("/listings", "POST", payload),

  get: (id: string) => req<{ listing: any }>(`/listings/${id}`, "GET"),
  update: (id: string, patch: Record<string, unknown>) => req<{ listing: any; reReview: boolean }>(`/listings/${id}`, "PATCH", patch),
  remove: (id: string) => req<{ deleted: boolean; trashDays: number }>(`/listings/${id}`, "DELETE"),
  mine: () =>
    req<{
      items: MyListing[];
      counts: { live: number; pending: number; action: number };
      /** Manager filter chips, counted server-side (designs/P9 S6). */
      filters: { key: string; label: string; count: number }[];
    }>("/listings/mine", "GET"),
  trash: () => req<{ items: MyListing[]; trashDays: number }>("/listings/trash", "GET"),
  /** P10 S5 — archived (sold/rented) listings; rented ones carry canReactivate. */
  archived: () => req<{ items: (MyListing & { archivedAt: string | null })[] }>("/listings/archived", "GET"),
  /** "Delete now" — permanent, and only for something already in trash. */
  purge: (id: string) => req<{ purged: boolean }>(`/listings/${id}/purge`, "POST"),
  /** Similar live listings for the detail rail — matched server-side. */
  similar: (id: string) => req<{ items: MyListing[] }>(`/listings/${id}/similar`, "GET"),
  /** P9 S5 — owner-only; 404 for anyone else's listing, same as a bad id. */
  insights: (id: string) => req<{ listing: ListingInsights }>(`/listings/${id}/insights`, "GET"),
  /** Records a share for the Shares metric. Open to guests; owner's own is dropped. */
  recordShare: (id: string, channel: "copy" | "whatsapp" | "native") =>
    req<{ recorded: boolean }>(`/listings/${id}/share`, "POST", { channel }),
  setStatus: (id: string, action: string) => req<{ listing: MyListing }>(`/listings/${id}/status`, "POST", { action }),
  submit: (id: string) => req<{ submitted: boolean; already?: boolean }>(`/listings/${id}/submit`, "POST", {}),
  stillAvailable: (id: string, stillAvailable: boolean) =>
    req<{ stillAvailable: boolean }>(`/listings/${id}/still-available`, "POST", { stillAvailable }),

  // ---- projects (P6 S5, Builder-only) --------------------------------------
  /** The ₹9,999 slot is drawn server-side; PLAN_REQUIRED comes back if none. */
  createProject: (payload: Record<string, unknown>) =>
    req<{ project: { id: string } }>("/projects", "POST", payload),
  myProjects: () => req<{ items: MyProject[] }>("/projects", "GET"),
  /**
   * The project lifecycle (migration 0079) — the mirror of the three listing
   * calls above it. A project had none of these until now, which is why a
   * builder could not take a scheme down or get its ₹9,999 slot back.
   */
  setProjectStatus: (id: string, action: "hide" | "unhide" | "restore") =>
    req<{ project: { id: string; status: string } }>(`/projects/${id}/status`, "POST", { action }),
  removeProject: (id: string) => req<{ deleted: boolean }>(`/projects/${id}`, "DELETE"),
  purgeProject: (id: string) => req<{ purged: boolean }>(`/projects/${id}/purge`, "POST"),
  brochure: (projectId: string) =>
    req<{ brochure: { url: string | null; scanned: boolean } | null }>(`/projects/${projectId}/brochure`, "GET"),
  deleteBrochure: (projectId: string) =>
    req<{ deleted: boolean }>(`/projects/${projectId}/brochure`, "DELETE"),

  // ---- requirements (P6 S4) ------------------------------------------------
  /** Quota strip + the poster's own requirements. Quota is server-computed. */
  myRequirements: () =>
    req<{
      items: RequirementCard[];
      quota: { left: number; unlimited: boolean; validityDays: number; label: string };
    }>("/requirements/mine", "GET"),
  postRequirement: (payload: Record<string, unknown>) =>
    req<{ requirement: RequirementCard }>("/requirements", "POST", payload),
  /** Edit an existing requirement in place — no second quota post (Doc2 §5.3). */
  updateRequirement: (id: string, payload: Record<string, unknown>) =>
    req<{ requirement: RequirementCard }>(`/requirements/${id}`, "PATCH", payload),

  /** This listing as the FEED CARD renders it — the Preview screen's card tab. */
  previewCard: (id: string) => req<{ card: import("@/lib/feed/client").FeedCard }>(`/listings/${id}/card`, "GET"),
  /** Same, for a project — the builder's Preview screen card tab. */
  previewProjectCard: (id: string) =>
    req<{ card: import("@/lib/feed/client").FeedCard }>(`/projects/${id}/card`, "GET"),
  getProject: (id: string) => req<{ project: any }>(`/projects/${id}`, "GET"),
  /** Builder-only project insights; 404 for anyone else's, same as a bad id. */
  projectInsights: (id: string) => req<{ project: ProjectInsights }>(`/projects/${id}/insights`, "GET"),
  /** Tapping Call/WhatsApp on a project records a lead for the builder. */
  recordProjectContact: (id: string, channel: "call" | "whatsapp") =>
    req<{ recorded: boolean }>(`/projects/${id}/contact`, "POST", { channel }, { keepalive: true }),
  /** Per-unit sold-out toggle — the builder's most frequent update (Doc2 §6). */
  updateProjectUnits: (id: string, units: { id: string; available: boolean }[]) =>
    req<{ project: any }>(`/projects/${id}/units`, "PATCH", { units }),
  updateProject: (id: string, payload: Record<string, unknown>) =>
    req<{ project: { id: string } }>(`/projects/${id}`, "PATCH", payload),

  // `capacity` is the owner's per-role photo cap, sent by the server so the
  // "6 / 10" counter is never a client-side guess. Absent for non-owners.
  photos: (id: string) =>
    req<{ photos: Photo[]; capacity: { max: number | null; used: number; remaining: number | null } | null }>(
      `/listings/${id}/photos`,
      "GET",
    ),
  reorderPhotos: (id: string, order: string[]) => req<{ photos: Photo[] }>(`/listings/${id}/photos`, "PATCH", { order }),
  /** "Add label" from the tile sheet — stored as the photo's alt text. */
  labelPhoto: (id: string, photoId: string, altText: string) =>
    req<{ photos: Photo[] }>(`/listings/${id}/photos`, "PATCH", { photoId, altText }),
  deletePhoto: (id: string, photoId: string) => req<{ photos: Photo[] }>(`/listings/${id}/photos/${photoId}`, "DELETE"),

  /**
   * The project gallery (migration 0075). A project used to carry one
   * `cover_url` and nothing else, so its detail hero could not be swiped.
   */
  projectPhotos: (id: string) =>
    req<{ photos: Photo[]; capacity: { max: number | null; used: number; remaining: number | null } | null }>(
      `/projects/${id}/photos`,
      "GET",
    ),
  reorderProjectPhotos: (id: string, order: string[]) => req<{ photos: Photo[] }>(`/projects/${id}/photos`, "PATCH", { order }),
  labelProjectPhoto: (id: string, photoId: string, altText: string) =>
    req<{ photos: Photo[] }>(`/projects/${id}/photos`, "PATCH", { photoId, altText }),
  deleteProjectPhoto: (id: string, photoId: string) => req<{ photos: Photo[] }>(`/projects/${id}/photos/${photoId}`, "DELETE"),
};

/**
 * Upload photos: presign → PUT the bytes straight to storage → commit.
 *
 * The bytes never pass through our API, and the client never picks the storage
 * key — presign mints it. `onProgress` drives the per-tile progress UI, and a
 * failed file is reported individually so the grid can offer a per-tile retry
 * (Doc2 §5.2) rather than failing the whole batch.
 */
export async function uploadPhotos(
  listingId: string,
  rawFiles: File[],
  onProgress?: (done: number, total: number) => void,
  /**
   * Which gallery — a listing's or a project's (migration 0075). The two flows
   * are byte-for-byte the same (presign → PUT → commit); only the route differs,
   * so they share this one function rather than a copy that drifts.
   */
  subject: "listings" | "projects" = "listings",
): Promise<{
  ok: boolean; photos?: Photo[]; failed: string[]; error?: string; rejected?: number;
  /** How many photos were auto-cropped into the allowed aspect band. */
  autoCropped?: number;
}> {
  // Normalise BEFORE presigning: the aspect clamp and downscale change both the
  // content type and the byte size, and presign validates against those. A
  // panorama or a very tall shot is centre-cropped into the 4:5…1.91:1 band so
  // it can't be mangled by the card's object-cover at display time.
  const normalized = await normalizeImages(rawFiles);
  const files = normalized.map((n) => n.file);
  const autoCropped = normalized.filter((n) => n.reason === "cropped-tall" || n.reason === "cropped-wide").length;

  const presign = await req<{ grants: { url: string; key: string; headers: Record<string, string> }[] }>(
    `/${subject}/${listingId}/photos/presign`,
    "POST",
    { files: files.map((f) => ({ contentType: f.type, size: f.size })) },
  );
  if (!presign.ok) {
    const code = presign.error.code;
    return {
      ok: false,
      failed: files.map((f) => f.name),
      error:
        code === "PHOTO_LIMIT" || (presign.error as any).code === "VALIDATION_ERROR"
          ? `You've reached the photo limit for this ${subject === "projects" ? "project" : "listing"}`
          : code === "FILE_TOO_LARGE" ? "One of those files is over 25MB"
          : code === "FILE_TYPE_BLOCKED" ? "Only JPG, PNG, WebP or HEIC images are allowed"
          : "Couldn't start the upload",
    };
  }

  const grants = presign.data.grants;
  const uploaded: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < grants.length; i++) {
    try {
      const res = await fetch(grants[i].url, {
        method: "PUT",
        headers: grants[i].headers,
        body: files[i],
        credentials: grants[i].url.startsWith("/api/") ? "same-origin" : "omit",
      });
      if (res.ok) uploaded.push(grants[i].key);
      else failed.push(files[i].name);
    } catch {
      failed.push(files[i].name);
    }
    onProgress?.(i + 1, grants.length);
  }

  if (!uploaded.length) return { ok: false, failed, error: "Upload failed" };

  const commit = await req<{ photos: Photo[]; added: number; rejected: number }>(
    `/${subject}/${listingId}/photos/commit`,
    "POST",
    { keys: uploaded },
  );
  if (!commit.ok) return { ok: false, failed, error: "Couldn't save those photos" };

  // The server inspects the real bytes and can refuse a file the browser
  // happily uploaded — surface that rather than showing a silent empty tile.
  const { photos, added, rejected } = commit.data;
  if (rejected > 0 && added === 0) {
    return { ok: false, photos, failed, error: rejected === 1 ? "That file isn't a valid image" : `${rejected} files weren't valid images` };
  }
  return { ok: true, photos, failed, rejected, autoCropped };
}

/**
 * Ownership proof (P5 section H) — presign → PUT to the PRIVATE bucket →
 * commit. Same three-step shape as photos and brochures; `kind: "doc"` is what
 * puts it in the private bucket, and that mapping lives on the server so the
 * client can never aim a document at public storage.
 */
export async function uploadDoc(file: File): Promise<{ ok: boolean; key?: string; error?: string }> {
  const presign = await req<{ grant: { url: string; key: string; headers: Record<string, string> } }>(
    "/uploads/presign",
    "POST",
    { kind: "doc", contentType: file.type, size: file.size },
  );
  if (!presign.ok) {
    const code = presign.error.code;
    return {
      ok: false,
      error: code === "FILE_TOO_LARGE" ? "That file is too large"
        : code === "FILE_TYPE_BLOCKED" ? "Upload a PDF or an image"
        : "Couldn't start the upload",
    };
  }

  const { url, key, headers } = presign.data.grant;
  try {
    const put = await fetch(url, {
      method: "PUT",
      headers,
      body: file,
      credentials: url.startsWith("/api/") ? "same-origin" : "omit",
    });
    if (!put.ok) return { ok: false, error: "Upload failed" };
  } catch {
    return { ok: false, error: "Upload failed" };
  }

  // The server reads the real bytes here — a renamed .exe never becomes a proof.
  const commit = await req<{ committed: boolean }>("/uploads/commit", "POST", { key, kind: "doc" });
  if (!commit.ok) return { ok: false, error: "That file isn't a valid document" };
  return { ok: true, key };
}

/** Price helpers used by the form's live formatting (display only). */
export function formatIndianCommas(digits: string): string {
  const n = digits.replace(/\D/g, "");
  if (!n) return "";
  const last3 = n.slice(-3);
  const rest = n.slice(0, -3);
  return rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
}

/** "8500000" → "₹85 Lakh" — the word confirmation under the price field. */
export function priceInWords(digits: string): string {
  const n = parseInt(digits.replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1_00_00_000) return `₹${+(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${+(n / 1_00_000).toFixed(2)} Lakh`;
  if (n >= 1_000) return `₹${+(n / 1_000).toFixed(2)} K`;
  return `₹${n}`;
}

/**
 * Upload a project brochure: presign → PUT straight to the private bucket →
 * commit. The commit step is where the server reads the real bytes and checks
 * the PDF magic number, which is what the design's "Scanning… → Ready ✓" state
 * is actually reporting.
 */
export async function uploadBrochure(
  projectId: string,
  file: File,
): Promise<{ ok: boolean; error?: string }> {
  if (file.type !== "application/pdf") return { ok: false, error: "Brochures must be a PDF" };

  const presign = await req<{ grant: { url: string; key: string; headers: Record<string, string> } }>(
    `/projects/${projectId}/brochure?stage=presign`,
    "POST",
    { contentType: file.type, size: file.size },
  );
  if (!presign.ok) {
    return {
      ok: false,
      error: presign.error.code === "FILE_TOO_LARGE" ? "That brochure is over 10MB" : "Couldn't start the upload",
    };
  }

  const { url, key, headers } = presign.data.grant;
  try {
    const put = await fetch(url, {
      method: "PUT",
      headers,
      body: file,
      credentials: url.startsWith("/api/") ? "same-origin" : "omit",
    });
    if (!put.ok) return { ok: false, error: "Upload failed" };
  } catch {
    return { ok: false, error: "Upload failed" };
  }

  const commit = await req<{ attached: boolean }>(`/projects/${projectId}/brochure?stage=commit`, "POST", { key });
  if (!commit.ok) {
    const msg = (commit.error as { message?: string }).message;
    return { ok: false, error: msg ?? "That file isn't a valid PDF" };
  }
  return { ok: true };
}

export interface RequirementDetail {
  id: string;
  access: "own" | "unlocked" | "locked";
  kind: "sell" | "rent";
  kindLabel: string;
  typeCode: string;
  /** `property_types.label` — the code is storage, not something to print. */
  typeLabel: string | null;
  bhk: number | null;
  areaLabel: string | null;
  urgency: string;
  urgencyLabel: string;
  isUrgent: boolean;
  status: string;
  badge: { kind: string; label: string };
  postedOn: string | null;
  daysLeft: number | null;
  /** Present only when access !== "locked" — the server omits them entirely. */
  budgetLabel?: string;
  notes?: string | null;
  referenceId?: string;
  /** Own-requirement extras. */
  isActive?: boolean;
  proposalCount?: number;
  quotaNote?: string;
  /** Own-only raw values, for re-opening the edit form. */
  budgetMinPaise?: number | null;
  budgetMaxPaise?: number | null;
  areaIds?: string[];
}

export const requirementsApi = {
  /** `unlockPlan` is non-null only for a LOCKED viewer — the plan their role can buy. */
  get: (id: string) => req<{ requirement: RequirementDetail; unlockPlan: UnlockPlan | null }>(`/requirements/${id}`, "GET"),
  setActive: (id: string, isActive: boolean) =>
    req<{ requirement: RequirementDetail }>(`/requirements/${id}`, "PATCH", { isActive }),
  fulfill: (id: string) =>
    req<{ requirement: RequirementDetail }>(`/requirements/${id}`, "PATCH", { fulfilled: true }),
  reopen: (id: string) =>
    req<{ requirement: RequirementDetail }>(`/requirements/${id}`, "PATCH", { reopen: true }),
  remove: (id: string) => req<{ deleted: boolean }>(`/requirements/${id}`, "DELETE"),
};

// ---- Module 5: browse, proposals, matching, visits, leads ------------------

export interface BrowseCard {
  id: string;
  access: "unlocked" | "locked";
  kind: "sell" | "rent";
  kindLabel: string;
  typeCode: string;
  bhk: number | null;
  summary: string;
  isUrgent: boolean;
  isBoosted: boolean;
  postedAgo: string;
  budgetLabel?: string;
  areaLabel?: string;
  posterName?: string;
  posterRole?: string;
  posterVerified?: boolean;
  proposalCount?: number;
  alreadySent?: boolean;
  tier: BrowseTier;
}
/** "state" / "india" are the widened fallbacks — see lib/listings/matching. */
export type BrowseTier = "exact" | "adjacent" | "city" | "state" | "india";
export interface BrowseSection { tier: BrowseTier; label: string | null; cards: BrowseCard[]; }

/** Server-decided empty screen — copy AND the action it offers. */
export interface BrowseEmpty { title: string; subtitle: string; action: "pick_city" | null; }
/** Where the browse list is anchored (profile city / guest's picked city / none). */
export interface BrowseScope {
  cityId: string | null; cityName: string | null;
  stateId: string | null; stateName: string | null;
  source: "profile" | "picked" | "none";
}

export interface MatchedListing {
  id: string; title: string | null; priceLabel: string; areaLabel: string | null;
  coverUrl: string | null; bhk: number | null; tier: "exact" | "adjacent" | "city"; tierLabel: string | null;
}

export interface ReceivedProposal {
  id: string;
  status: "pending" | "accepted" | "declined" | "not_relevant" | "expired" | "fulfilled";
  message: string;
  sentAgo: string;
  isNew: boolean;
  sender: {
    id: string; name: string; role: string | null;
    verified: { phone: boolean; id: boolean; rera: boolean };
    memberSince: string; profilePct: number; phone: string;
  };
  listing: { id: string; title: string | null; priceLabel: string; areaLabel: string | null; coverUrl: string | null } | null;
  threadId: string | null;
}

export interface SentProposal {
  id: string; requirementId: string;
  status: "pending" | "accepted" | "declined" | "not_relevant" | "expired" | "fulfilled";
  requirementRef: string; poster: { name: string; role: string | null };
  listing: { title: string | null; priceLabel: string; coverUrl: string | null } | null;
  sentAt: string; footnote: string; nonRefund: boolean; threadId: string | null;
}

/**
 * The plan the wall must offer THIS viewer (migration 0087) — code, price and
 * period all from `plan_catalog`, never typed into the component.
 */
export interface UnlockPlan {
  code: string;
  name: string;
  price: string;
  subLabel: string | null;
  short: string;
}

export interface BrowseResult {
  sections: BrowseSection[];
  unlocked: boolean;
  cityName: string | null;
  scope: BrowseScope;
  /** non-null ONLY when there is nothing to show; carries its own copy + action */
  empty: BrowseEmpty | null;
  balance: { left: number; total: number; unlimited: boolean };
  canPropose: boolean;
  unlockPlan: UnlockPlan | null;
}

export const browseApi = {
  /**
   * `cityId` is the GUEST's city-chip choice. A signed-in profile's city always
   * wins server-side, so this can only ever scope a viewer who has no city of
   * their own — it is a filter the browser asks for, not a fact it asserts.
   */
  list: (kind?: "sell" | "rent" | null, typeCode?: string | null, cityId?: string | null) =>
    req<BrowseResult>(`/requirements/browse?${browseQuery(kind, typeCode, cityId)}`, "GET"),

  /**
   * The same answer for the FEED shell (Doc7 §79). Identical payload — one
   * server engine — but this route is IP rate-limited, which the feed needs and
   * the browse screen does not: the requirement-mode feed is reachable
   * anonymously on the public host. It existed with no caller at all; the guest
   * feed was quietly hitting the unlimited browse route instead.
   */
  feed: (kind?: "sell" | "rent" | null, typeCode?: string | null, cityId?: string | null) =>
    req<BrowseResult>(`/feed/requirement-mode?${browseQuery(kind, typeCode, cityId)}`, "GET"),
};

function browseQuery(kind?: "sell" | "rent" | null, typeCode?: string | null, cityId?: string | null) {
  return new URLSearchParams({
    ...(kind ? { kind } : {}),
    ...(typeCode ? { type: typeCode } : {}),
    ...(cityId ? { city: cityId } : {}),
  }).toString();
}

export const proposalsApi = {
  /** The sender's own live listings for the picker + current balance. */
  sheet: (requirementId: string) =>
    req<{
      balance: { left: number; total: number; unlimited: boolean };
      /** false = builder with no LIVE project (0087); the sheet says so. */
      canPropose: boolean;
      alreadySent: boolean;
      listings: { id: string; title: string | null; priceLabel: string; areaLabel: string | null; coverUrl: string | null }[];
      /** "I Have a Property" covers projects too — a builder offers a scheme. */
      projects: { id: string; title: string | null; priceLabel: string; areaLabel: string | null; coverUrl: string | null }[];
      /** Chips + consent wording come from inquiry_options, never hardcoded. */
      offers: { code: string; label: string }[];
      when: { code: string; label: string }[];
      consentText: string;
      consentVersion: string;
      myNumber: string | null;
    }>(`/requirements/${requirementId}/proposals`, "GET"),
  send: (
    requirementId: string,
    body: {
      mode: "listing" | "help";
      listingId?: string | null;
      projectId?: string | null;
      offers?: string[];
      contactPref?: "call" | "whatsapp";
      contactNumber?: string | null;
      whenToken?: string;
      preferredDate?: string | null;
      consent: boolean;
    },
  ) =>
    req<{ proposal: { id: string }; balanceLeft: number }>(`/requirements/${requirementId}/proposals`, "POST", body),
  /** Poster view: proposals received on a requirement they own (numbers auto). */
  received: (requirementId: string) =>
    req<{ items: ReceivedProposal[]; requirementRef: string; filters: { key: string; label: string; count: number }[] }>(
      `/requirements/${requirementId}/proposals?view=received`, "GET"),
  mine: () =>
    req<{ items: SentProposal[]; balance: { left: number; total: number; unlimited: boolean }; filters: { key: string; label: string; count: number }[] }>(
      "/proposals/mine", "GET"),
  accept: (id: string) => req<{ status: string; threadId: string | null }>(`/proposals/${id}`, "PATCH", { action: "accept" }),
  decline: (id: string) => req<{ status: string }>(`/proposals/${id}`, "PATCH", { action: "decline" }),
  notRelevant: (id: string) => req<{ status: string; flagged: boolean }>(`/proposals/${id}`, "PATCH", { action: "not_relevant" }),
};

export const matchApi = {
  forRequirement: (id: string) => req<{ items: MatchedListing[] }>(`/match/for-requirement/${id}`, "GET"),
};

export interface VisitView {
  id: string;
  scheduledAt: string;
  note: string | null;
  status: "proposed" | "confirmed" | "completed" | "cancelled";
  outcome: "done" | "cancelled" | null;
  section: "tomorrow" | "this_week" | "upcoming" | "completed" | "cancelled";
  timeLabel: string;
  dateLabel: string;
  listing: { title: string | null; priceLabel: string; areaLabel: string | null; coverUrl: string | null } | null;
  counterparty: { name: string; role: string | null };
  threadId: string | null;
  isPast: boolean;
}

export const visitsApi = {
  mine: (filter?: string) => req<{ items: VisitView[] }>(`/visits/mine${filter ? `?filter=${filter}` : ""}`, "GET"),
  reschedule: (id: string, scheduledAt: string, note: string | null) =>
    req<{ updated: boolean }>(`/visits/${id}`, "PATCH", { action: "reschedule", scheduledAt, note }),
  cancel: (id: string, reason: string | null) => req<{ updated: boolean }>(`/visits/${id}`, "PATCH", { action: "cancel", reason }),
  outcome: (id: string, outcome: "done" | "cancelled") => req<{ updated: boolean }>(`/visits/${id}`, "PATCH", { action: "outcome", outcome }),
  confirm: (id: string) => req<{ updated: boolean }>(`/visits/${id}`, "PATCH", { action: "confirm" }),
};

export interface LeadView {
  id: string;
  stage: "new" | "contacted" | "visit" | "negotiation" | "closed_won" | "closed_lost";
  source: "inquiry" | "proposal" | "visit";
  lastActivity: string | null;
  lastActivityAt: string;
  notes: { text: string; at: string }[];
  lead: { name: string; role: string | null; verified: { phone: boolean; id: boolean; rera: boolean }; memberSince: string; profilePct: number };
  property: { id: string; title: string | null; priceLabel: string; areaLabel: string | null; coverUrl: string | null } | null;
  threadId: string | null;
}

/**
 * Leads moved to `lib/leads/client.ts` when the pipeline was rebuilt around
 * subjects (my listing → its leads) instead of one flat list. What stays here
 * is the CSV export, which the seller screens still link to.
 */
export const leadsApi = {
  exportUrl: (fields: string[]) => `/api/v1/leads/export?fields=${fields.join(",")}`,
};

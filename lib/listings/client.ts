"use client";

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

export interface TypeConfig {
  code: string;
  label: string;
  category: "residential" | "commercial" | "plot" | "pg";
  kinds: ("sell" | "rent")[];
  fields: string[];
  hidden: string[];
  /** Attribute keys the server refuses to accept empty, per type. */
  required: string[];
  areaUnits: boolean;
}

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
}

export interface MyListing {
  id: string;
  title: string | null;
  price: string;
  areaLabel: string | null;
  coverUrl: string | null;
  photoCount: number;
  typeCode: string;
  kind: string;
  status: string;
  availability: string;
  badge: { kind: string; label: string };
  reviewNotes: Record<string, string> | null;
  rejectReason: string | null;
  isLocked: boolean;
  canBoost: boolean;
  canReactivate: boolean;
  /** The 2-month prompt is waiting for an answer on this listing. */
  stillAvailableAsked?: boolean;
  /** Trash only — days before the purge cron removes it for good. */
  daysLeft?: number;
  createdOn: string | null;
}

export const listingsApi = {
  config: () =>
    req<{
      role: string | null;
      types: TypeConfig[];
      /** Field definitions incl. every option list — server-owned (Doc2 §5.1). */
      fieldDefs: Record<string, { key: string; label: string; control: any; options: { value: string; label: string }[]; placeholder: string | null; hint: string | null; showIf: { field: string; in: string[] } | null; units: "land" | "built" | null }>;
      amenities: { code: string; label: string; category: string; categories: string[] }[];
      categories: { key: string; label: string }[];
      areaUnits: string[];
    }>("/listings/config", "GET"),

  locations: (level: string, parent?: string | null) =>
    req<{ items: LocationNode[] }>(`/locations/children?level=${level}${parent ? `&parent=${parent}` : ""}`, "GET"),
  /** Resolve nodes by id — used to redraw chips an edit form loaded as ids. */
  locationsByIds: (ids: string[]) =>
    req<{ items: LocationNode[] }>(`/locations/children?ids=${ids.join(",")}`, "GET"),
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
  /** "Delete now" — permanent, and only for something already in trash. */
  purge: (id: string) => req<{ purged: boolean }>(`/listings/${id}/purge`, "POST"),
  /** Similar live listings for the detail rail — matched server-side. */
  similar: (id: string) => req<{ items: MyListing[] }>(`/listings/${id}/similar`, "GET"),
  setStatus: (id: string, action: string) => req<{ listing: MyListing }>(`/listings/${id}/status`, "POST", { action }),
  submit: (id: string) => req<{ submitted: boolean; already?: boolean }>(`/listings/${id}/submit`, "POST", {}),
  stillAvailable: (id: string, stillAvailable: boolean) =>
    req<{ stillAvailable: boolean }>(`/listings/${id}/still-available`, "POST", { stillAvailable }),

  // ---- projects (P6 S5, Builder-only) --------------------------------------
  /** The ₹9,999 slot is drawn server-side; PLAN_REQUIRED comes back if none. */
  createProject: (payload: Record<string, unknown>) =>
    req<{ project: { id: string } }>("/projects", "POST", payload),
  myProjects: () => req<{ items: any[] }>("/projects", "GET"),
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

  getProject: (id: string) => req<{ project: any }>(`/projects/${id}`, "GET"),
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
    `/listings/${listingId}/photos/presign`,
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
          ? `You've reached the photo limit for this listing`
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
    `/listings/${listingId}/photos/commit`,
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
  get: (id: string) => req<{ requirement: RequirementDetail }>(`/requirements/${id}`, "GET"),
  setActive: (id: string, isActive: boolean) =>
    req<{ requirement: RequirementDetail }>(`/requirements/${id}`, "PATCH", { isActive }),
  fulfill: (id: string) =>
    req<{ requirement: RequirementDetail }>(`/requirements/${id}`, "PATCH", { fulfilled: true }),
  remove: (id: string) => req<{ deleted: boolean }>(`/requirements/${id}`, "DELETE"),
};

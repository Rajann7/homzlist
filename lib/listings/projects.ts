import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { consumeQuota, reserveSlot, transitionSlot } from "@/lib/billing/service";
import { formatShortRupees } from "@/lib/billing/money";
import { getAmenityLabels } from "./service";
import { STATUS_BADGE } from "./dto";

/**
 * Builder projects (Doc2 §6, Doc7 §59-61).
 *
 * A project consumes the SAME listing-slot pool as a property, drawn from the
 * ₹9,999 Builder plan — so payment-first holds identically here (Doc9 §11).
 *
 * One deliberate difference from listings: project contact numbers are ALWAYS
 * public (Doc2 §6), so there's no number-privacy branch in the project DTO.
 */

const db = () => createServiceClient();

export class NoProjectSlotError extends Error {
  constructor() {
    super("PLAN_REQUIRED");
  }
}

export interface ProjectUnitInput {
  unitType?: string;
  areaSqft?: number;
  carpetSqft?: number;
  priceFromPaise?: number;
  unitsAvailable?: number;
  floorPlanUrl?: string;
}

export async function createProject(
  profileId: string,
  input: {
    name: string;
    reraNumber: string | null;
    reraExempt: boolean;
    reraExemptReason: string | null;
    buildStatus: string | null;
    possessionDate: string | null;
    towers: number | null;
    floors: number | null;
    totalUnits: number | null;
    availableUnits: number | null;
    bankApprovals: string[];
    amenities: string[];
    description: string | null;
    stateId: string | null;
    districtId: string | null;
    talukaId: string | null;
    cityId: string;
    areaId: string | null;
    areaLabel: string | null;
    pincode: string | null;
    units: ProjectUnitInput[];
  },
) {
  // Payment-first: draw the slot before writing anything.
  const userPlanId = await consumeQuota(profileId, "listing", 1, { type: "project", note: "project submitted" });
  if (!userPlanId) throw new NoProjectSlotError();
  const slotId = await reserveSlot(profileId, userPlanId);

  // 6-month validity from the plan; the 1-year expiry cycle runs off `expires_at`.
  const expires = new Date(Date.now() + 365 * 86_400_000).toISOString();

  const { data, error } = await db()
    .from("projects")
    .insert({
      profile_id: profileId,
      slot_id: slotId,
      name: input.name,
      status: "pending_review",
      // Projects have no draft step — created = submitted for review.
      submitted_at: new Date().toISOString(),
      rera_number: input.reraNumber,
      rera_exempt: input.reraExempt,
      rera_exempt_reason: input.reraExemptReason,
      build_status: input.buildStatus,
      possession_date: input.possessionDate,
      towers: input.towers,
      floors: input.floors,
      total_units: input.totalUnits,
      available_units: input.availableUnits,
      bank_approvals: input.bankApprovals,
      amenities: input.amenities,
      description: input.description,
      state_id: input.stateId,
      district_id: input.districtId,
      taluka_id: input.talukaId,
      city_id: input.cityId,
      area_id: input.areaId,
      area_label: input.areaLabel,
      pincode: input.pincode,
      expires_at: expires,
    })
    .select("*")
    .single();

  if (error) {
    await transitionSlot(slotId, profileId, "released", "project insert failed");
    throw error;
  }

  const project = data as { id: string };

  // Unit-type repeater (Doc2 §6) — rendered as an expandable table on detail.
  const units = input.units
    .filter((u) => typeof u.unitType === "string" && u.unitType.trim())
    .slice(0, 40)
    .map((u, i) => ({
      project_id: project.id,
      unit_type: String(u.unitType).slice(0, 40),
      area_sqft: Number.isFinite(u.areaSqft) ? Math.trunc(u.areaSqft as number) : null,
      carpet_sqft: Number.isFinite(u.carpetSqft) ? Math.trunc(u.carpetSqft as number) : null,
      units_available: Number.isFinite(u.unitsAvailable) ? Math.trunc(u.unitsAvailable as number) : null,
      price_from_paise: Number.isFinite(u.priceFromPaise) ? Math.trunc(u.priceFromPaise as number) : null,
      floor_plan_url: typeof u.floorPlanUrl === "string" ? u.floorPlanUrl.slice(0, 500) : null,
      position: i,
    }));
  if (units.length) await db().from("project_units").insert(units);

  await db().from("listing_slots").update({ listing_id: project.id }).eq("id", slotId);
  return projectDTO(data, units);
}

/**
 * Edit a project the caller already owns (P6 S5 in edit mode).
 *
 * No slot is drawn and `expires_at` is left alone — the ₹9,999 was paid when
 * the project was created, and an edit must not restart or re-charge that.
 * Units are replaced wholesale because the form edits them as one repeater;
 * they carry no state of their own worth preserving row-by-row.
 *
 * Like a listing edit, the project returns to `pending_review`: the RERA
 * number, unit prices and possession date are exactly what review checks.
 */
export async function updateProject(
  projectId: string,
  profileId: string,
  input: Omit<Parameters<typeof createProject>[1], never>,
) {
  const { data: owned } = await db()
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!owned) return null;

  const { data, error } = await db()
    .from("projects")
    .update({
      name: input.name,
      status: "pending_review",
      // Content diverged from what was approved (migration 0050).
      edited_since_approval: true,
      submitted_at: new Date().toISOString(),
      rera_number: input.reraNumber,
      rera_exempt: input.reraExempt,
      rera_exempt_reason: input.reraExemptReason,
      build_status: input.buildStatus,
      possession_date: input.possessionDate,
      towers: input.towers,
      floors: input.floors,
      total_units: input.totalUnits,
      available_units: input.availableUnits,
      bank_approvals: input.bankApprovals,
      amenities: input.amenities,
      description: input.description,
      state_id: input.stateId,
      district_id: input.districtId,
      taluka_id: input.talukaId,
      city_id: input.cityId,
      area_id: input.areaId,
      area_label: input.areaLabel,
      pincode: input.pincode,
    })
    .eq("id", projectId)
    .eq("profile_id", profileId)
    .select("*")
    .single();
  if (error) throw error;

  const units = input.units
    .filter((u) => typeof u.unitType === "string" && u.unitType.trim())
    .slice(0, 40)
    .map((u, i) => ({
      project_id: projectId,
      unit_type: String(u.unitType).slice(0, 40),
      area_sqft: Number.isFinite(u.areaSqft) ? Math.trunc(u.areaSqft as number) : null,
      carpet_sqft: Number.isFinite(u.carpetSqft) ? Math.trunc(u.carpetSqft as number) : null,
      units_available: Number.isFinite(u.unitsAvailable) ? Math.trunc(u.unitsAvailable as number) : null,
      price_from_paise: Number.isFinite(u.priceFromPaise) ? Math.trunc(u.priceFromPaise as number) : null,
      floor_plan_url: typeof u.floorPlanUrl === "string" ? u.floorPlanUrl.slice(0, 500) : null,
      position: i,
    }));
  await db().from("project_units").delete().eq("project_id", projectId);
  if (units.length) await db().from("project_units").insert(units);

  return projectDTO(data, units);
}

/**
 * Record a project lead (migration 0051).
 *
 * Fired when a signed-in viewer taps Call or WhatsApp on a live project that
 * isn't theirs — the only two contact affordances a project detail has, and
 * until now both left no trace whatsoever.
 *
 * Idempotent per (builder, person, project) via the partial unique index: a
 * buyer tapping Call four times is ONE lead whose activity moves forward, not
 * four. A guest cannot be a lead — `leads.lead_profile_id` is not nullable and
 * an anonymous "someone" is not something a builder can follow up.
 *
 * Never throws: failing to record a lead must not stop the call connecting.
 */
export async function recordProjectLead(
  projectId: string,
  ownerId: string,
  leadProfileId: string,
  activity: string,
): Promise<boolean> {
  if (ownerId === leadProfileId) return false;
  try {
    const { error } = await db().from("leads").upsert(
      {
        owner_id: ownerId,
        lead_profile_id: leadProfileId,
        project_id: projectId,
        source: "inquiry",
        stage: "new",
        last_activity: activity.slice(0, 120),
        last_activity_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,lead_profile_id,project_id" },
    );
    return !error;
  } catch {
    return false;
  }
}

/**
 * The builder's insight count for one project: LEADS, and only leads.
 *
 * Views and shares were briefly built here and are deliberately gone — a
 * builder's question is "who wants this project", not "how many people
 * scrolled past it", and two of the four cards would have been noise. Nothing
 * else about a project is countable today without inventing it.
 */
export async function ownerProjectLeadCount(projectId: string): Promise<number> {
  const { count } = await db()
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("is_relevant", true);
  return count ?? 0;
}

export async function listMyProjects(profileId: string) {
  const { data } = await db()
    .from("projects")
    .select("*, project_units(*)")
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const amenityLabels = await getAmenityLabels();
  return ((data ?? []) as any[]).map((p) => projectDTO(p, p.project_units ?? [], amenityLabels));
}

/**
 * A builder's projects as a VISITOR may see them (P9 S2 Projects tab).
 *
 * The visitor profile's Projects tab used to fall through to the same `listings`
 * array the Sell/Rent tab renders, so a builder's projects were nowhere on their
 * public profile and the tab silently lied — the header could say "1 Project"
 * while the tab showed five listings. This is the query behind that tab.
 *
 * `live` only, mirroring `listPublicByProfile` for listings: a project still in
 * review is not public, and the count on the same screen is computed the same
 * way, so the tab and the number can never disagree.
 */
export async function listPublicProjectsByProfile(profileId: string) {
  const { data } = await db()
    .from("projects")
    .select("*, project_units(*)")
    .eq("profile_id", profileId)
    .eq("status", "live")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);
  const amenityLabels = await getAmenityLabels();
  return ((data ?? []) as any[]).map((p) => projectDTO(p, p.project_units ?? [], amenityLabels));
}

/**
 * Project detail. Numbers are always public here by design (Doc2 §6), so unlike
 * a listing there is no contact-withholding branch.
 */
export async function getProject(id: string, viewerId: string | null) {
  const { data } = await db().from("projects").select("*, project_units(*)").eq("id", id).maybeSingle();
  const p = data as any | null;
  if (!p || p.deleted_at) return null;

  const isOwner = viewerId !== null && p.profile_id === viewerId;
  // Same state-access matrix as listings: non-live is owner-only.
  if (p.status !== "live" && !isOwner) return null;

  // Doc2 §6: a builder's number is ALWAYS public for a project. Projects carry
  // no contact column of their own, so the public number is the builder's
  // profile phone — surfaced here so the detail bar's Call/WhatsApp are real.
  const { data: poster } = await db()
    .from("profiles")
    .select("phone,name")
    .eq("id", p.profile_id)
    .maybeSingle();

  const amenityLabels = await getAmenityLabels();
  return {
    ...projectDTO(p, p.project_units ?? [], amenityLabels),
    isOwner,
    // The builder's profile id. Needed to write a lead against them when a
    // viewer taps Call/WhatsApp, and no more sensitive than the poster id the
    // feed already publishes on every card.
    profileId: p.profile_id,
    contact: (poster as { phone?: string | null } | null)?.phone
      ? { number: (poster as { phone: string }).phone, name: (poster as { name?: string | null }).name ?? null }
      : null,
    pincode: p.pincode ?? null,
    brochureScanned: p.brochure_scanned,
    // Owner-only: the raw values the edit form re-opens on. The public payload
    // carries labels (`rera`, `areaLabel`), not the location ids.
    ...(isOwner
      ? {
          owner: {
            reraNumber: p.rera_number,
            reraExempt: p.rera_exempt,
            reraExemptReason: p.rera_exempt_reason,
            stateId: p.state_id,
            districtId: p.district_id,
            talukaId: p.taluka_id,
            cityId: p.city_id,
            areaId: p.area_id,
          },
        }
      : {}),
  };
}

export async function updateProjectUnits(projectId: string, profileId: string, units: { id: string; available: boolean }[]) {
  // Ownership is checked once on the parent, not per unit row.
  const { data } = await db().from("projects").select("id").eq("id", projectId).eq("profile_id", profileId).maybeSingle();
  if (!data) return false;
  for (const u of units.slice(0, 40)) {
    await db().from("project_units").update({ available: u.available === true }).eq("id", u.id).eq("project_id", projectId);
  }
  return true;
}

const BUILD_STATUS_LABEL: Record<string, string> = {
  booking_open: "Booking open",
  under_construction: "Under Construction",
  ready: "Ready to move",
};

function projectDTO(p: any, units: any[], amenityLabels?: Map<string, string>) {
  // Cheapest unit — what a project card shows where a listing shows its price.
  const from = (units ?? [])
    .map((u) => u.price_from_paise)
    .filter((v): v is number => typeof v === "number" && v > 0)
    .sort((a, b) => a - b)[0];

  return {
    // Projects live on the same `listing_state` enum as listings, so they carry
    // the same badge rather than a parallel one (designs/P9 S1 Projects tab).
    badge: STATUS_BADGE[p.status] ?? { kind: "expired", label: p.status },
    priceFrom: from ? formatShortRupees(from) : null,
    buildStatusLabel: p.build_status ? BUILD_STATUS_LABEL[p.build_status] ?? p.build_status : null,
    possessionLabel: p.possession_date
      ? new Date(p.possession_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
      : null,
    id: p.id,
    name: p.name,
    status: p.status,
    rera: p.rera_exempt ? { exempt: true as const, reason: p.rera_exempt_reason } : { exempt: false as const, number: p.rera_number },
    buildStatus: p.build_status,
    possessionDate: p.possession_date,
    towers: p.towers,
    floors: p.floors,
    totalUnits: p.total_units,
    availableUnits: p.available_units,
    bankApprovals: p.bank_approvals ?? [],
    // Labels, not stored codes — same rule as the listing detail DTO.
    amenities: (p.amenities ?? []).map((a: string) => amenityLabels?.get(a) ?? a),
    description: p.description,
    areaLabel: p.area_label,
    coverUrl: p.cover_url,
    units: (units ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((u) => ({
        id: u.id,
        unitType: u.unit_type,
        areaSqft: u.area_sqft,
        carpetSqft: u.carpet_sqft,
        unitsAvailable: u.units_available,
        priceFrom: u.price_from_paise ? formatShortRupees(u.price_from_paise) : null,
        priceFromPaise: u.price_from_paise ?? null,
        floorPlanUrl: u.floor_plan_url,
        available: u.available,
      })),
  };
}

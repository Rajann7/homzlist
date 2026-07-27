import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getListingForViewer, getPropertyType, getFieldDefinitions, getFieldGroups, updateListing, softDeleteListing, recordListingView, resolveLocationChain, isPromoted, ownerListingStats, getAmenityLabels } from "@/lib/listings/service";
import { rateLimit, clientIp, hashIp } from "@/lib/auth/rate-limit";
import { listingDetailDTO } from "@/lib/listings/dto";

/**
 * GET    /api/v1/listings/:id (Doc7 §51) — detail, subject to the state-access
 *        matrix (Doc2 §5.4). draft/pending/rejected/hidden/archived are
 *        owner-only; deleted is 404 for everyone. Non-viewable → 404, never 403,
 *        so ids can't be probed (Doc9 §API1).
 * PATCH  /api/v1/listings/:id (Doc7 §52) — edit; a major change (photos or
 *        location) sends it back for re-review.
 * DELETE /api/v1/listings/:id (Doc7 §54) — soft delete → 30-day trash.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");
  const claims = await getCurrentUser();

  // A guest may view a `live` listing — the matrix, not the session, decides.
  const listing = await getListingForViewer(params.id, claims?.sub ?? null);
  if (!listing) return fail("NOT_FOUND");

  // Count the view (Doc2 §13): live listings only, never the owner's own, one
  // per viewer per IST day. A guest is keyed by a salted ip+ua hash — no raw
  // IP is stored. Fire-and-forget so it can't slow or break the response.
  if (listing.status === "live" && claims?.sub !== listing.profile_id) {
    const key = claims?.sub ?? `g:${await hashIp(clientIp(req.headers) + "|" + (req.headers.get("user-agent") ?? ""))}`;
    void recordListingView(listing.id, key);
  }

  const isOwner = claims?.sub === listing.profile_id;
  const [type, fieldDefs, promoted, stats, amenityLabels, fieldGroups] = await Promise.all([
    getPropertyType(listing.type_code),
    // Needed to turn stored codes ("semi", "1-5") into the labels the design
    // shows ("Semi-furnished", "1–5 years") — resolved server-side.
    getFieldDefinitions(),
    // PROMOTED badge and the owner's stats strip are both real queries — the
    // client is never told to assume either (designs/P4 S1).
    isPromoted(listing.id),
    isOwner ? ownerListingStats(listing.id) : Promise.resolve(null),
    // Amenity codes -> the labels the design shows.
    getAmenityLabels(),
    // The detail screen renders its attributes in the same titled blocks the
    // creation form used, so the section list has to come along.
    getFieldGroups(),
  ]);
  const dto = listingDetailDTO(listing, type, { isOwner, fieldDefs, promoted, stats, amenityLabels, fieldGroups });

  // For the owner's edit form, hand back a COMPLETE location chain even if the
  // row stored a broken one — the cascade needs every ancestor to unlock.
  if (isOwner && (dto as { owner?: { location?: unknown } }).owner) {
    const chain = await resolveLocationChain({
      stateId: listing.state_id, districtId: listing.district_id, talukaId: listing.taluka_id,
      cityId: listing.city_id, areaId: listing.area_id,
    });
    (dto as { owner: { location: Record<string, unknown> } }).owner.location = {
      ...(dto as { owner: { location: Record<string, unknown> } }).owner.location,
      ...chain,
    };
  }
  return ok({ listing: dto });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  // Ownership-scoped already, but an edit loop writes price-history rows — cap it.
  const limited = await rateLimit(`listing-edit:${claims.sub}`, 120, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  // Whitelist — status, slot_id, reject_count and friends are server-owned and
  // must never be settable from a request body (mass-assignment, Doc9 §API6).
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 120);
  if (typeof body.description === "string") patch.description = body.description.slice(0, 5000);
  if (typeof body.pricePaise === "number") patch.price_paise = Math.trunc(body.pricePaise);
  if (typeof body.priceOnRequest === "boolean") patch.price_on_request = body.priceOnRequest;
  if (typeof body.isNegotiable === "boolean") patch.is_negotiable = body.isNegotiable;
  if (typeof body.contactPublic === "boolean") patch.contact_public = body.contactPublic;
  // Phone fields get the SAME 10-digit check the create path runs — an edit
  // must not be a way to store junk (or an oversized string) where a payer
  // reads a "phone number" (audit finding).
  const phoneErr = (v: unknown) => typeof v === "string" && v.trim() && !/^[6-9]\d{9}$/.test(v.replace(/\D/g, "").slice(-10));
  if (typeof body.contactNumber === "string") {
    if (phoneErr(body.contactNumber)) return fail("VALIDATION_ERROR", { field: "contactNumber" });
    patch.contact_number = body.contactNumber.replace(/\D/g, "").slice(-10) || null;
  }
  if (Array.isArray(body.amenities)) patch.amenities = body.amenities.filter((a: unknown) => typeof a === "string").slice(0, 40);
  if (body.attributes && typeof body.attributes === "object") patch.attributes = body.attributes;
  if (typeof body.areaId === "string") patch.area_id = body.areaId;
  if (typeof body.cityId === "string") patch.city_id = body.cityId;
  if (typeof body.stateId === "string") patch.state_id = body.stateId;
  if (typeof body.districtId === "string") patch.district_id = body.districtId;
  if (typeof body.talukaId === "string") patch.taluka_id = body.talukaId;
  if (typeof body.areaLabel === "string") patch.area_label = body.areaLabel.slice(0, 120);
  // Pincode is required on a listing, so an edit may CHANGE it but never clear
  // it. This used to silently null anything that didn't match, which turned
  // "the user typed five digits" into "this listing has no postal anchor".
  if (body.pincode !== undefined) {
    const pin = String(body.pincode ?? "").trim();
    if (!/^[1-9]\d{5}$/.test(pin)) {
      return fail("VALIDATION_ERROR", { errors: { pincode: pin ? "Enter a valid 6-digit pincode" : "Select a pincode" } });
    }
    patch.pincode = pin;
  }
  // The rest of what the edit form can change. Everything here is a field the
  // create endpoint already accepts; status/slot/reject_count stay server-owned.
  if (typeof body.depositPaise === "number") patch.deposit_paise = Math.trunc(body.depositPaise);
  if (typeof body.maintenancePaise === "number") patch.maintenance_paise = Math.trunc(body.maintenancePaise);
  if (typeof body.maintenanceIncluded === "boolean") patch.maintenance_included = body.maintenanceIncluded;
  if (typeof body.availableFrom === "string") patch.available_from = body.availableFrom;
  if (typeof body.altNumber === "string" || body.altNumber === null) {
    if (phoneErr(body.altNumber)) return fail("VALIDATION_ERROR", { field: "altNumber" });
    patch.alt_number = (typeof body.altNumber === "string" && body.altNumber.replace(/\D/g, "").slice(-10)) || null;
  }
  if (typeof body.whatsappNumber === "string" || body.whatsappNumber === null) {
    if (phoneErr(body.whatsappNumber)) return fail("VALIDATION_ERROR", { field: "whatsappNumber" });
    patch.whatsapp_number = (typeof body.whatsappNumber === "string" && body.whatsappNumber.replace(/\D/g, "").slice(-10)) || null;
  }
  if (typeof body.ownershipProofType === "string" || body.ownershipProofType === null) patch.ownership_proof_type = body.ownershipProofType || null;
  if (typeof body.ownershipProofKey === "string") patch.ownership_proof_key = body.ownershipProofKey;

  if (!Object.keys(patch).length) return fail("VALIDATION_ERROR");

  const result = await updateListing(params.id, claims.sub, patch);
  if (!result) return fail("NOT_FOUND");

  const type = await getPropertyType(result.listing.type_code);
  return ok({
    listing: listingDetailDTO(result.listing, type, { isOwner: true }),
    reReview: result.reReview,
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`listing-delete:${claims.sub}`, 60, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const deleted = await softDeleteListing(params.id, claims.sub);
  if (!deleted) return fail("NOT_FOUND");
  // A never-approved listing gives its slot back; a previously-live one doesn't
  // (Doc2 §4.2 — consumed on approve). softDeleteListing decides which.
  return ok({ deleted: true, trashDays: 30 });
}

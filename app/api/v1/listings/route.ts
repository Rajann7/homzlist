import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createListing, getPropertyType, NoSlotError } from "@/lib/listings/service";
import { validateListing } from "@/lib/listings/validate";
import { listingCardDTO } from "@/lib/listings/dto";
import { getUserPrefs } from "@/lib/settings/service";

/**
 * POST /api/v1/listings (Doc7 §47) — submit a listing for review.
 *
 * THE payment-first gate (Doc9 §11). `createListing` draws a listing slot from
 * the caller's paid plans before it writes anything; with no quota it throws
 * PLAN_REQUIRED and no row is created. Posting here directly, skipping the plan
 * wall, therefore buys nothing — the wall is UI, this is the control.
 *
 * Validation mirrors the client's rules exactly, and keeps Doc2 §5.3's split:
 * errors block, warnings are returned but never prevent the post.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");

  const limited = await rateLimit(`listing-create:${claims.sub}`, 30, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const typeCode = typeof body.typeCode === "string" ? body.typeCode : "";
  const type = await getPropertyType(typeCode);
  if (!type) return fail("VALIDATION_ERROR", { field: "typeCode" });

  // Role gate: PG/Hostel is Owner/Broker only (Doc2 §5.1) — enforced here, not
  // just by the type list the form was rendered from.
  if (profile.role && !type.roles.includes(profile.role)) return fail("FORBIDDEN");

  const kind: "sell" | "rent" = body.kind === "rent" ? "rent" : "sell";
  const priceOnRequest = body.priceOnRequest === true;

  // "Show my number by default on new listings" (P10 S6b Privacy). The default
  // is the user's STORED preference, applied here rather than trusted from the
  // client — a payload that omits `contactPublic` gets the setting the user
  // actually chose, not a hardcoded false.
  const prefs = await getUserPrefs(claims.sub);
  const contactPublic = typeof body.contactPublic === "boolean" ? body.contactPublic : prefs.showNumberDefault;
  const pricePaise =
    typeof body.pricePaise === "number" && Number.isFinite(body.pricePaise) ? Math.trunc(body.pricePaise) : null;

  const input = {
    typeCode,
    kind,
    title: typeof body.title === "string" ? body.title.trim().slice(0, 120) : null,
    description: typeof body.description === "string" ? body.description.slice(0, 5000) : null,
    pricePaise,
    priceOnRequest,
    cityId: typeof body.cityId === "string" ? body.cityId : null,
    areaId: typeof body.areaId === "string" ? body.areaId : null,
    pincode: typeof body.pincode === "string" ? body.pincode.trim() : null,
    attributes: typeof body.attributes === "object" && body.attributes ? body.attributes : {},
    photoCount: typeof body.photoCount === "number" ? body.photoCount : 0,
    contact: { public: contactPublic, number: typeof body.contactNumber === "string" ? body.contactNumber : null },
  };

  const { errors, warnings, flaggedReason } = validateListing(input, type);
  if (Object.keys(errors).length) return fail("VALIDATION_ERROR", { errors, warnings });

  try {
    const listing = await createListing(claims.sub, {
      typeCode,
      kind,
      title: input.title,
      description: input.description,
      pricePaise,
      priceOnRequest,
      isNegotiable: body.isNegotiable === true,
      depositPaise: typeof body.depositPaise === "number" ? Math.trunc(body.depositPaise) : null,
      maintenancePaise: typeof body.maintenancePaise === "number" ? Math.trunc(body.maintenancePaise) : null,
      maintenanceIncluded: body.maintenanceIncluded === true,
      availableFrom: typeof body.availableFrom === "string" ? body.availableFrom : null,
      location: {
        stateId: body.stateId ?? null,
        districtId: body.districtId ?? null,
        talukaId: body.talukaId ?? null,
        cityId: input.cityId,
        areaId: input.areaId,
        pincode: typeof body.pincode === "string" ? body.pincode.slice(0, 10) : null,
        label: typeof body.areaLabel === "string" ? body.areaLabel.slice(0, 120) : null,
      },
      attributes: input.attributes,
      amenities: Array.isArray(body.amenities) ? body.amenities.filter((a: unknown) => typeof a === "string").slice(0, 40) : [],
      contact: {
        public: input.contact.public,
        number: input.contact.number,
        alt: typeof body.altNumber === "string" ? body.altNumber : null,
        whatsapp: typeof body.whatsappNumber === "string" ? body.whatsappNumber : null,
      },
      ownershipProof: { type: body.ownershipProofType ?? null, key: body.ownershipProofKey ?? null },
      flaggedReason,
    });

    // Warnings ride along with the success so the UI can still nudge.
    return ok({ listing: listingCardDTO(listing), warnings });
  } catch (e) {
    // No listing slot → the client shows the plan wall (Doc2 §4.1).
    if (e instanceof NoSlotError) return fail("PLAN_REQUIRED");
    throw e;
  }
}

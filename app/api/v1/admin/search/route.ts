import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { isDenial, requireStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import { audit } from "@/lib/admin/audit";

/**
 * GET /api/v1/admin/search?q= — the header's global search (Doc3 §1.3).
 *
 * Groups are filtered by capability, not just hidden: a Staff-level search must
 * not return payment rows even though the same query would find them for an
 * Admin. Searching by phone is a lookup of personal data, so it is audited —
 * Doc3 §1.8 treats reading a user's details as an admin action, and a phone
 * search is the cheapest way to fish for one.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_RE = /^[+]?\d[\d\s-]{5,}$/;
const LIMIT = 5;

export async function GET(req: NextRequest) {
  const gate = await requireStaff();
  if (isDenial(gate)) return gate.response;
  const { staff } = gate;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return ok({ groups: [] });

  const db = createServiceClient();
  const like = `%${q}%`;
  const digits = q.replace(/[^\d]/g, "");
  const groups: Array<{ group: string; label: string; hits: unknown[] }> = [];

  // USERS — name or phone. Only for levels that may open a user at all.
  if (can(staff.level, "users.edit")) {
    let query = db.from("profiles").select("id, name, phone, role, state").limit(LIMIT);
    query = PHONE_RE.test(q) && digits.length >= 6 ? query.ilike("phone", `%${digits}%`) : query.ilike("name", like);
    const { data } = await query;
    if (data?.length) {
      groups.push({
        group: "users",
        label: "Users",
        hits: (data as Record<string, unknown>[]).map((r) => ({
          id: r.id,
          href: `/users/${r.id}`,
          primary: (r.name as string) || "Unnamed",
          secondary: (r.phone as string) ?? null,
          badge: (r.role as string) ?? null,
        })),
      });
    }
  }

  // LISTINGS — title, or an exact id paste.
  if (can(staff.level, "queues.view")) {
    const { data } = UUID_RE.test(q)
      ? await db.from("listings").select("id, title, status, area_label").eq("id", q).limit(1)
      : await db.from("listings").select("id, title, status, area_label").ilike("title", like).limit(LIMIT);
    if (data?.length) {
      groups.push({
        group: "listings",
        label: "Listings",
        hits: (data as Record<string, unknown>[]).map((r) => ({
          id: r.id,
          href: `/listings/${r.id}`,
          primary: (r.title as string) || "Untitled",
          secondary: (r.area_label as string) ?? null,
          badge: (r.status as string) ?? null,
        })),
      });
    }
  }

  // PAYMENTS — the gateway ids an admin pastes from a ticket.
  if (can(staff.level, "refunds")) {
    const { data } = await db
      .from("orders")
      .select("id, gateway_order_id, gateway_payment_id, amount_paise, status")
      .or(`gateway_payment_id.ilike.${like},gateway_order_id.ilike.${like}`)
      .limit(LIMIT);
    if (data?.length) {
      groups.push({
        group: "payments",
        label: "Payments",
        hits: (data as Record<string, unknown>[]).map((r) => ({
          id: r.id,
          href: `/payments/${r.id}`,
          primary: (r.gateway_payment_id as string) || (r.gateway_order_id as string) || String(r.id),
          secondary: `₹${(Number(r.amount_paise ?? 0) / 100).toLocaleString("en-IN")}`,
          badge: (r.status as string) ?? null,
        })),
      });
    }
  }

  // REQUIREMENTS
  if (can(staff.level, "queues.view")) {
    const { data } = await db.from("requirements").select("id, area_label, status, type_code").ilike("area_label", like).limit(LIMIT);
    if (data?.length) {
      groups.push({
        group: "requirements",
        label: "Requirements",
        hits: (data as Record<string, unknown>[]).map((r) => ({
          id: r.id,
          href: `/queues/requirements/${r.id}`,
          primary: (r.area_label as string) || "Requirement",
          secondary: (r.type_code as string) ?? null,
          badge: (r.status as string) ?? null,
        })),
      });
    }
  }

  // TICKETS — by number or subject.
  if (can(staff.level, "tickets")) {
    const { data } = await db
      .from("support_tickets")
      .select("id, number, subject, status, category")
      .or(`subject.ilike.${like},number.ilike.${like}`)
      .limit(LIMIT);
    if (data?.length) {
      groups.push({
        group: "tickets",
        label: "Tickets",
        hits: (data as Record<string, unknown>[]).map((r) => ({
          id: r.id,
          href: `/support/tickets/${r.id}`,
          primary: (r.number as string) ?? String(r.id),
          secondary: (r.subject as string) ?? null,
          badge: (r.status as string) ?? null,
        })),
      });
    }
  }

  if (PHONE_RE.test(q) && digits.length >= 6) {
    await audit({
      actor: staff,
      action: "edit",
      entityType: "user",
      entityLabel: `phone search “${q}”`,
      summary: `Searched for a phone number (${groups.find((g) => g.group === "users")?.hits.length ?? 0} matches)`,
      sensitive: true,
    });
  }

  return ok({ groups });
}

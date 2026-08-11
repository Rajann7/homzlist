import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Admin view of a LEAD — what replaced the read-only chat viewer.
 *
 * With no messages in the product, the lead IS the evidence: who asked, what
 * they asked for, which number was shared with whom, when contact actually
 * happened, and every report filed against it. That is exactly what a moderator
 * needs to resolve a "this person is spamming me" or "who gave out my number"
 * complaint, and it is all here in one read.
 *
 * Read-only by construction: this module exposes no writer. Admin acts on the
 * PEOPLE (warn/suspend from the user panel) or on the report, never on someone
 * else's lead.
 */

const db = () => createServiceClient();

export interface AdminLead {
  id: string;
  stage: string;
  source: string;
  createdAt: string;
  lastActivity: string | null;
  lastActivityAt: string;
  seenAt: string | null;
  closedReason: string | null;
  isRelevant: boolean;
  wants: string[];
  wantLabels: string[];
  contactPref: string | null;
  contactNumber: string | null;
  whenToken: string | null;
  preferredOn: string | null;
  subject: { kind: string; id: string | null; title: string; subtitle: string };
  offer: { kind: string; id: string; title: string } | null;
  sender: { id: string; name: string; phone: string | null; role: string | null } | null;
  owner: { id: string; name: string; phone: string | null; role: string | null } | null;
  consent: { version: string | null; at: string | null; ip: string | null };
  contactEvents: { channel: string; at: string; actorId: string }[];
  reports: { id: string; reason: string; note: string | null; status: string; at: string; reporterId: string }[];
  notes: { text: string; at: string }[];
}

export async function adminLead(id: string): Promise<AdminLead | null> {
  const { data } = await db().from("leads").select("*").eq("id", id).maybeSingle();
  const l = data as Record<string, any> | null;
  if (!l) return null;

  const people = [l.lead_profile_id, l.owner_id].filter(Boolean) as string[];
  const [{ data: profs }, { data: events }, { data: reports }, { data: opts }, { data: inq }, { data: prop }, { data: offerL }, { data: offerP }] =
    await Promise.all([
      db().from("profiles").select("id,name,phone,role").in("id", people),
      db().from("lead_contact_events").select("channel,created_at,actor_id").eq("lead_id", id).order("created_at", { ascending: false }),
      db().from("reports").select("id,reason,note,status,created_at,reporter_id").eq("subject_type", "lead").eq("subject_id", id),
      db().from("inquiry_options").select("code,label"),
      l.inquiry_id
        ? db().from("inquiries").select("consent_version,consent_at,consent_ip").eq("id", l.inquiry_id).maybeSingle()
        : Promise.resolve({ data: null }),
      l.proposal_id
        ? db().from("proposals").select("consent_version,consent_at,consent_ip").eq("id", l.proposal_id).maybeSingle()
        : Promise.resolve({ data: null }),
      l.offer_listing_id ? db().from("listings").select("id,title").eq("id", l.offer_listing_id).maybeSingle() : Promise.resolve({ data: null }),
      l.offer_project_id ? db().from("projects").select("id,name").eq("id", l.offer_project_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

  const person = (pid: string | null) => {
    const p = ((profs ?? []) as any[]).find((x) => x.id === pid);
    return p ? { id: p.id, name: p.name ?? "—", phone: p.phone ?? null, role: p.role ?? null } : null;
  };
  const labelOf = new Map(((opts ?? []) as { code: string; label: string }[]).map((o) => [o.code, o.label]));
  const snap = (l.subject_snapshot ?? {}) as Record<string, string | null>;
  const consentRow = (inq ?? prop) as { consent_version: string | null; consent_at: string | null; consent_ip: string | null } | null;

  return {
    id: l.id,
    stage: l.stage,
    source: l.source,
    createdAt: l.created_at,
    lastActivity: l.last_activity,
    lastActivityAt: l.last_activity_at,
    seenAt: l.seen_at,
    closedReason: l.closed_reason,
    isRelevant: l.is_relevant,
    wants: l.wants ?? [],
    wantLabels: (l.wants ?? []).map((w: string) => labelOf.get(w) ?? w),
    contactPref: l.contact_pref,
    contactNumber: l.contact_number,
    whenToken: l.when_token,
    preferredOn: l.preferred_on,
    subject: {
      kind: l.listing_id ? "listing" : l.project_id ? "project" : l.requirement_id ? "requirement" : "—",
      id: l.listing_id ?? l.project_id ?? l.requirement_id ?? null,
      title: snap.title ?? "—",
      subtitle: snap.subtitle ?? "",
    },
    offer: offerL
      ? { kind: "listing", id: (offerL as any).id, title: (offerL as any).title ?? "Property" }
      : offerP
        ? { kind: "project", id: (offerP as any).id, title: (offerP as any).name ?? "Project" }
        : null,
    sender: person(l.lead_profile_id),
    owner: person(l.owner_id),
    consent: {
      version: consentRow?.consent_version ?? null,
      at: consentRow?.consent_at ?? null,
      ip: consentRow?.consent_ip ?? null,
    },
    contactEvents: ((events ?? []) as any[]).map((e) => ({ channel: e.channel, at: e.created_at, actorId: e.actor_id })),
    reports: ((reports ?? []) as any[]).map((r) => ({
      id: r.id, reason: r.reason, note: r.note, status: r.status, at: r.created_at, reporterId: r.reporter_id,
    })),
    notes: (l.notes ?? []) as { text: string; at: string }[],
  };
}

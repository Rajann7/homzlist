"use client";

/**
 * The READ-ONLY LEAD viewer — what replaced the chat viewer (template 1390).
 *
 * There is no composer and no edit control, and that is the design's own rule
 * carried across: an admin reads the evidence and then acts on the PEOPLE or on
 * the report, never on someone else's lead. `/api/v1/admin/leads/:id` has no
 * POST at all, so the absent button is the visible half of a rule the server
 * keeps (Doc9).
 *
 * With messages gone from the product, this IS the evidence a moderator needs:
 * who asked, what they asked for, which number was shared, the consent that
 * authorised sharing it, when contact actually happened, and every report
 * filed. Opening it is audited as a sensitive read.
 */

import { useEffect, useState } from "react";
import { AdminIcon, Avatar, Shimmer, usePanels, type PanelEntry } from "@/components/admin/ds";

type Lead = {
  id: string;
  stage: string;
  source: string;
  createdAt: string;
  lastActivity: string | null;
  lastActivityAt: string;
  seenAt: string | null;
  closedReason: string | null;
  isRelevant: boolean;
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
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—";

const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", visit: "Contacted", negotiation: "Contacted",
  converted: "Converted", closed_won: "Converted", archived: "Archived", closed_lost: "Archived",
};

export function LeadPanelBody({ panel }: { panel: PanelEntry }) {
  const id = String(panel.data.id ?? "");
  const { pushPanel } = usePanels();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/admin/leads/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setLead(j?.ok ? (j.data as Lead) : null); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Shimmer h={56} /><Shimmer h={96} /><Shimmer h={140} />
      </div>
    );
  }
  if (!lead) return <div style={{ fontSize: 13, color: "var(--ink3)" }}>This lead no longer exists.</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Banner>Read-only — admins can view a lead for moderation. Nothing here can be edited.</Banner>

      {/* Who */}
      <Card title="People">
        <Person label="Sender" p={lead.sender} onOpen={pushPanel} />
        <div style={{ height: 1, background: "var(--divider)", margin: "10px 0" }} />
        <Person label="Received by" p={lead.owner} onOpen={pushPanel} />
      </Card>

      {/* What it is about */}
      <Card title="Subject">
        <Row k="Kind" v={lead.subject.kind} />
        <Row k="Title" v={lead.subject.title} />
        {lead.subject.subtitle ? <Row k="Detail" v={lead.subject.subtitle} /> : null}
        {lead.offer ? <Row k="Offered back" v={`${lead.offer.title} (${lead.offer.kind})`} /> : null}
      </Card>

      {/* The payload that IS the evidence */}
      <Card title="What was asked for">
        <Row k="Wants" v={lead.wantLabels.join(" · ") || "—"} />
        <Row k="Contact by" v={lead.contactPref ?? "—"} />
        <Row k="Number shared" v={lead.contactNumber ?? "—"} mono />
        <Row k="Best time" v={[lead.whenToken, lead.preferredOn].filter(Boolean).join(" · ") || "—"} />
        <Row k="Sent" v={when(lead.createdAt)} />
        <Row k="Seen by receiver" v={lead.seenAt ? when(lead.seenAt) : "Not opened yet"} />
      </Card>

      {/* Consent — the row that authorised sharing the number */}
      <Card title="Consent">
        {lead.consent.version ? (
          <>
            <Row k="Version" v={lead.consent.version} />
            <Row k="Accepted" v={when(lead.consent.at)} />
            <Row k="From IP" v={lead.consent.ip ?? "—"} mono />
          </>
        ) : (
          <Empty>No consent row — this lead predates the consent record.</Empty>
        )}
      </Card>

      {/* Did a connection actually happen? */}
      <Card title={`Contact attempts · ${lead.contactEvents.length}`}>
        {lead.contactEvents.length === 0 ? (
          <Empty>The receiver has not tapped Call or WhatsApp on this lead.</Empty>
        ) : (
          lead.contactEvents.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
              <AdminIcon name={e.channel === "whatsapp" ? "msg" : e.channel === "profile" ? "users" : "send"} size={14} />
              <span style={{ fontSize: 12, color: "var(--ink1)", textTransform: "capitalize" }}>{e.channel}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink3)" }}>{when(e.at)}</span>
            </div>
          ))
        )}
      </Card>

      {/* Status + moderation history */}
      <Card title="Status">
        <Row k="Stage" v={STAGE_LABEL[lead.stage] ?? lead.stage} />
        <Row k="Last activity" v={`${lead.lastActivity ?? "—"} · ${when(lead.lastActivityAt)}`} />
        {lead.closedReason ? <Row k="Closed because" v={lead.closedReason} /> : null}
        {!lead.isRelevant ? <Row k="Marked" v="Not relevant by the receiver" /> : null}
      </Card>

      {lead.reports.length > 0 ? (
        <Card title={`Reports · ${lead.reports.length}`}>
          {lead.reports.map((r) => (
            <div key={r.id} style={{ padding: "8px 0", borderTop: "1px solid var(--divider)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink1)" }}>{r.reason} · {r.status}</div>
              {r.note ? <div style={{ fontSize: 12, color: "var(--ink2)", marginTop: 3 }}>{r.note}</div> : null}
              <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 3 }}>{when(r.at)}</div>
            </div>
          ))}
        </Card>
      ) : null}

      {lead.notes.length > 0 ? (
        <Card title="Receiver's private notes">
          {lead.notes.map((n, i) => (
            <div key={i} style={{ padding: "6px 0" }}>
              <div style={{ fontSize: 12, color: "var(--ink1)" }}>{n.text}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>{when(n.at)}</div>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "var(--s1)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: "var(--ink3)", textTransform: "uppercase", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "4px 0", fontSize: 12 }}>
      <span style={{ width: 116, flex: "0 0 116px", color: "var(--ink3)" }}>{k}</span>
      <span style={{ flex: 1, minWidth: 0, color: "var(--ink1)", wordBreak: "break-word", fontFamily: mono ? "ui-monospace, monospace" : undefined }}>
        {v}
      </span>
    </div>
  );
}

function Person({
  label, p, onOpen,
}: {
  label: string;
  p: Lead["sender"];
  onOpen: (kind: string, data: Record<string, unknown>) => void;
}) {
  if (!p) return <Empty>{label}: account no longer exists.</Empty>;
  return (
    <div
      onClick={() => onOpen("user", { id: p.id, name: p.name })}
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
    >
      <Avatar initials={(p.name || "?").trim().slice(0, 1).toUpperCase()} size={32} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: "var(--ink3)" }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink1)" }}>{p.name}</div>
        <div style={{ fontSize: 11, color: "var(--ink3)" }}>
          {[p.role ?? "user", p.phone ?? "no number"].join(" · ")}
        </div>
      </div>
      <AdminIcon name="chevR" size={14} />
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--s2)", border: "1px solid var(--divider)", borderRadius: 8, padding: 10, fontSize: 12, color: "var(--ink2)" }}>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--ink3)" }}>{children}</div>;
}

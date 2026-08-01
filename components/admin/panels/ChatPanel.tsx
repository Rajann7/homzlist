"use client";

/**
 * The READ-ONLY chat viewer — template 1390-1409.
 *
 * There is no composer, and that is the design's own wording: "Read-only —
 * admins cannot send messages". Doc9 requires the same thing at the API, which
 * is why /api/v1/admin/threads/:id has no POST at all — the button being absent
 * is the visible half of a rule the server keeps.
 *
 * Deleted messages are SHOWN, labelled, because the design's footnote promises
 * it: "Deleted messages are shown to admins as 'Deleted by user' for evidence."
 * Their contents are stripped server-side; what survives is that one existed.
 */

import { useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Shimmer,
  Thumb,
  usePanels,
  type PanelEntry,
} from "@/components/admin/ds";

type Thread = {
  id: string;
  buyerId: string;
  posterId: string;
  startedAt: string;
  participants: { id: string; name: string; photo_url: string | null; role: string }[];
  listing: Record<string, string | number | null> | null;
  messages: {
    id: string;
    sender_id: string | null;
    kind: string;
    created_at: string;
    deleted: boolean;
    body: string | null;
    photo_url: string | null;
    meta: Record<string, unknown>;
  }[];
};

const money = (paise: unknown) =>
  paise === null || paise === undefined
    ? ""
    : `₹${Math.round(Number(paise) / 100).toLocaleString("en-IN")}`;

export function ChatPanelBody({ panel }: { panel: PanelEntry }) {
  const id = String(panel.data.id ?? "");
  const { pushPanel } = usePanels();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/admin/threads/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.ok) setThread(j.data as Thread);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading)
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <Shimmer key={i} h={40} />
        ))}
      </div>
    );
  if (!thread)
    return <div style={{ padding: 24, color: "var(--ink3)", fontSize: 13 }}>Thread not found.</div>;

  const poster = thread.participants.find((p) => p.id === thread.posterId);

  return (
    <>
      {/* the read-only banner — template 1391 */}
      <div
        style={{
          flex: "none",
          background: "var(--s3)",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "var(--ink2)",
        }}
      >
        <span style={{ color: "var(--ink3)" }}>
          <AdminIcon name="eye" size={16} />
        </span>
        Read-only — admins cannot send messages
      </div>

      {/* participant chips — template 1395, each opens that user */}
      <div
        style={{
          flex: "none",
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--divider)",
          flexWrap: "wrap",
        }}
      >
        {thread.participants.map((p) => (
          <span
            key={p.id}
            onClick={() => pushPanel("user", { id: p.id, name: p.name })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "var(--s2)",
              borderRadius: 999,
              padding: "4px 10px 4px 4px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Avatar initials={(p.name ?? "U").slice(0, 2).toUpperCase()} size={22} />
            {p.name}
          </span>
        ))}
      </div>

      {/* the pinned subject — template 1396 */}
      {thread.listing ? (
        <div
          style={{
            flex: "none",
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "10px 16px",
            background: "var(--s2)",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          <Thumb size={36} src={(thread.listing.cover_url as string) ?? null} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{String(thread.listing.title)}</div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>
              {money(thread.listing.price_paise)} · {String(thread.listing.status)}
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <Sys text={`Chat started · ${day(thread.startedAt)}`} />
        {thread.messages.map((m) => {
          const mine = m.sender_id === thread.posterId;
          if (m.deleted)
            return (
              <Bubble key={m.id} mine={mine} deleted>
                Deleted by user
              </Bubble>
            );
          if (m.kind === "system") return <Sys key={m.id} text={m.body ?? ""} />;
          if (m.kind === "number_card")
            return (
              <Card key={m.id} title="Contact shared">
                {String((m.meta as Record<string, unknown>).number ?? "shared")}
              </Card>
            );
          if (m.kind === "visit_confirmed" || m.kind === "visit_proposal")
            return (
              <Card key={m.id} title="Visit scheduled" accent>
                {String((m.meta as Record<string, unknown>).when ?? m.body ?? "")}
              </Card>
            );
          return (
            <Bubble key={m.id} mine={mine}>
              {m.body ?? (m.photo_url ? "[photo]" : "")}
            </Bubble>
          );
        })}
        <div style={{ fontSize: 11, color: "var(--ink3)", textAlign: "center", marginTop: 12 }}>
          Deleted messages are shown to admins as &quot;Deleted by user&quot; for evidence.
        </div>
      </div>
      {poster ? null : null}
    </>
  );
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function Bubble({
  children,
  mine,
  deleted,
}: {
  children: React.ReactNode;
  mine: boolean;
  deleted?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
      <div
        style={{
          maxWidth: "75%",
          background: deleted ? "var(--s3)" : mine ? "var(--accent)" : "var(--s2)",
          color: deleted ? "var(--ink3)" : mine ? "#fff" : "var(--ink1)",
          borderRadius: 12,
          padding: "8px 12px",
          fontSize: 13,
          fontStyle: deleted ? "italic" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Sys({ text }: { text: string }) {
  return (
    <div style={{ textAlign: "center", margin: "8px 0" }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--ink3)",
          background: "var(--s2)",
          padding: "4px 10px",
          borderRadius: 999,
        }}
      >
        {text}
      </span>
    </div>
  );
}

function Card({
  title,
  children,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div style={{ margin: "10px 0" }}>
      <div
        style={{
          border: `1px solid ${accent ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 12,
          padding: 12,
          fontSize: 12,
          background: accent ? "var(--accentSoft)" : undefined,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

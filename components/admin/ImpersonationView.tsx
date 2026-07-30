"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Thumb } from "./queueBits";
import { StatusBadge } from "./queueBits";

/**
 * A31's read-only user view (Doc5 A31 / the design's `impersonate` overlay).
 *
 * The design's warning strip sits at the top for the whole session and says how
 * long it has been running; "Exit session" closes it and logs the duration.
 *
 * Read-only is structural, not cosmetic: no form, no composer, no pay button and
 * no user session exists on this page, so there is nothing to disable.
 */

interface Props {
  sessionId: string;
  startedAt: string;
  user: { id: string; name: string; role: string | null; bio: string | null };
  listings: Array<{ id: string; title: string; status: string; priceLabel: string; location: string; coverUrl: string | null }>;
  plans: Array<{ name: string; isTrial: boolean; used: number; quota: number; expiresLabel: string }>;
  requirements: number;
}

const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  pending_review: "Pending",
  changes_requested: "Changes Requested",
  rejected: "Rejected",
  hidden: "Hidden",
  payment_pending: "Payment pending",
  archived: "Archived",
  draft: "Draft",
};

export function ImpersonationView({ sessionId, startedAt, user, listings, plans, requirements }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState("just now");

  useEffect(() => {
    const tick = () => {
      const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000);
      setElapsed(mins < 1 ? "just now" : `${mins} min ago`);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const end = async () => {
    setBusy(true);
    try {
      await fetch("/api/v1/admin/impersonation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "end", sessionId }),
        cache: "no-store",
      });
      router.push(`/users/${user.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* The design's warning strip: warning bg, #111 text, 13/600, and the exit */}
      <div
        className="mb-4 flex flex-wrap items-center gap-2 px-4 py-[10px] text-[13px] font-semibold"
        style={{ background: "var(--warning)", color: "#111" }}
      >
        <Icon name="eye" size={18} />
        <span className="flex-1">
          Viewing as {user.name} (read-only) · Started {elapsed}
        </span>
        <button
          type="button"
          onClick={end}
          disabled={busy}
          className="h-8 rounded-8 px-3 text-[13px] font-semibold"
          style={{ background: "#111", color: "#fff" }}
        >
          {busy ? "Ending…" : "Exit session"}
        </button>
      </div>

      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-[28px] font-bold">
          <span style={{ color: "var(--ink-primary)" }}>Homz</span>
          <span style={{ color: "var(--accent)" }}>List</span>
        </p>
        <p className="text-[14px]" style={{ color: "var(--ink-tertiary)" }}>
          User-app view as {user.name}
          {user.role ? ` · ${user.role}` : ""}
        </p>
        <p className="text-[12px]" style={{ color: "var(--ink-tertiary)" }}>
          All sends, payments and messages are disabled — none of them is rendered here, and no user
          session exists on this page.
        </p>
      </div>

      <Section title="Their plan">
        {plans.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            No active plan — they see the plan wall when they try to post.
          </p>
        ) : (
          plans.map((p, i) => (
            <div key={i} className="mb-2 rounded-12 border p-3" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
              <p className="text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                {p.name}
                {p.isTrial ? " · Trial" : ""}
              </p>
              <p className="mt-1 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
                {p.used} of {p.quota} listing slots used · expires {p.expiresLabel}
              </p>
            </div>
          ))
        )}
      </Section>

      <Section title={`Their listings (${listings.length})`}>
        {listings.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
            They have not posted anything.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {listings.map((l) => (
              <div key={l.id} className="flex items-center gap-[10px] rounded-12 border p-3" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
                <Thumb size={44} url={l.coverUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                    {l.title}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                    {l.priceLabel} · {l.location}
                  </p>
                </div>
                <StatusBadge label={STATUS_LABEL[l.status] ?? l.status} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Their requirements">
        <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          {requirements === 0 ? "None posted." : `${requirements} posted.`}
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.3px]" style={{ color: "var(--ink-tertiary)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

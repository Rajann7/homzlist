"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { Header } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { P12Chip, SectionH, shortDate } from "@/components/help/primitives";
import { accountApi, type ExportRequest } from "@/lib/support/client";

/**
 * P12 S5 — Download your data (DPDP §8, Doc7 #201).
 *
 * The inclusion list on screen is the literal contract the server keeps: your
 * profile, your listings and requirements, the messages YOU sent, your payments.
 * Messages other people sent you and other users' contact details are struck out
 * because the export genuinely excludes them.
 *
 * Idle → preparing → ready is driven by the server's status, and the download
 * link stops working when expires_at passes — so the "expires in 48 hours" line
 * describes real behaviour.
 */
export function DataDownload({ base = "" }: { base?: string }) {
  const toast = useToast();
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [state, setState] = useState<{ current: ExportRequest | null; previous: ExportRequest[]; linkHours: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await accountApi.exports();
    if (r.ok) setState(r.data);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const request = async () => {
    setBusy(true);
    const r = await accountApi.requestExport(format);
    setBusy(false);
    if (r.ok) {
      await load();
      toast.show("Your data is ready");
    } else {
      toast.show(
        r.error.code === "RATE_LIMITED" ? "You've requested 3 exports today — try again tomorrow" : "Couldn't prepare your data",
        { variant: "error" },
      );
    }
  };

  const header = <Header left={<BackButton fallback={`${base}/settings`} />} title="Download your data" />;

  if (loading) {
    return (
      <AppShell header={header}>
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="h-[220px] w-full rounded-12" />
          <Skeleton className="h-11 w-full rounded-8" />
        </div>
      </AppShell>
    );
  }

  const current = state?.current ?? null;
  const ready = current?.status === "ready";
  const rows = ready ? Object.values(current!.rowCounts ?? {}).reduce((a, b) => a + b, 0) : 0;

  return (
    <AppShell header={header}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 rounded-12 bg-surface-2 p-4">
          <p className="text-13 text-ink-secondary">
            Get a copy of your HomzList data — profile, listings, requirements, your own chat messages and payment
            records.
          </p>
          <div className="flex flex-col gap-2 text-13">
            <Included>Profile and account details</Included>
            <Included>Your listings and requirements</Included>
            <Included>Messages you sent</Included>
            <Included>Payment history and invoices</Included>
            <Excluded>Messages other people sent to you</Excluded>
            <Excluded>Other users&apos; contact details</Excluded>
          </div>
          <p className="text-11 text-ink-tertiary">
            We protect other people&apos;s privacy — only your own messages are included.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-1 text-13 font-semibold text-ink-primary">Format</span>
          <P12Chip on={format === "json"} onClick={() => setFormat("json")}>
            JSON
          </P12Chip>
          <P12Chip on={format === "csv"} onClick={() => setFormat("csv")}>
            CSV
          </P12Chip>
        </div>

        {busy ? (
          <div className="flex items-center gap-3 rounded-12 bg-info-soft p-4">
            <span className="h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
            <div className="flex flex-col gap-0.5">
              <p className="text-15 font-semibold text-ink-primary">Preparing your data…</p>
              <p className="text-11 text-ink-secondary">This usually takes a few moments.</p>
            </div>
          </div>
        ) : ready ? (
          <div className="flex flex-col gap-2 rounded-12 bg-accent-soft p-4">
            <span className="flex items-center gap-2">
              <Icon name="check" size={24} className="text-accent" />
              <span className="text-15 font-semibold text-ink-primary">Your data is ready</span>
            </span>
            <p className="text-11 text-ink-tertiary">
              {current!.filename} · {formatBytes(current!.bytes)} · {rows} record{rows === 1 ? "" : "s"}
            </p>
            <a
              href={`/api/v1/data/exports/${current!.id}/download`}
              className="chrome mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-8 bg-accent px-4 text-15 font-semibold text-white active:bg-accent-pressed"
            >
              <Icon name="download" size={20} className="text-white" />
              Download
            </a>
            <p className="text-11 text-ink-tertiary">
              This link expires {current!.expiresAt ? `on ${shortDate(current!.expiresAt)}` : `in ${state!.linkHours} hours`}.
            </p>
            <button
              type="button"
              onClick={request}
              className="chrome mt-1 self-start px-2 text-13 font-semibold text-accent"
            >
              Request again
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={request}
            className="chrome inline-flex h-11 w-full items-center justify-center rounded-8 bg-accent text-15 font-semibold text-white active:bg-accent-pressed"
          >
            Request data
          </button>
        )}

        {state && state.previous.length > 0 && (
          <div className="flex flex-col">
            <SectionH className="mx-0">Previous requests</SectionH>
            {state.previous.map((p) => (
              <div key={p.id} className="flex min-h-12 items-center justify-between border-t border-divider">
                <span className="text-13 text-ink-tertiary">
                  Requested {shortDate(p.createdAt)} · {p.status === "expired" ? "Expired" : p.status}
                </span>
                <button type="button" onClick={request} className="chrome px-2 text-13 font-semibold text-accent">
                  Request again
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Included({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-ink-primary">
      <Icon name="check" size={16} className="text-accent" />
      {children}
    </span>
  );
}
function Excluded({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-ink-tertiary">
      <span className="w-4 text-center">—</span>
      {children}
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

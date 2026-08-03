"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, Header, Icon, Button, Spinner, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { accountApi, type ExportRow } from "@/lib/content/client";

/**
 * P12 S5 — Download your data (DPDP §8, Doc7 §201).
 *
 * The included / excluded list is not decoration. What the ticks and dashes
 * promise is exactly what lib/account/service.ts collects: your profile, your
 * listings and requirements, the messages YOU sent, your payments — and
 * nothing belonging to the person on the other side of a conversation.
 *
 * "This link expires in 48 hours" is a stored `expires_at` swept by
 * /api/v1/cron/accounts, which also deletes the object. A ready row whose
 * expiry has passed is shown as expired on read, so the Download button never
 * outlives the file behind it.
 */
const INCLUDED = [
  "Profile and account details",
  "Your listings and requirements",
  "Messages you sent",
  "Payment history and invoices",
];
const EXCLUDED = ["Messages other people sent to you", "Other users' contact details"];

export function DataDownload({ base = "" }: { base?: string }) {
  const toast = useToast();
  const [view, setView] = useState<{ current: ExportRow | null; previous: ExportRow[] } | null>(null);
  const [offline, setOffline] = useState(false);
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const r = await accountApi.data();
    if (r.ok) { setView(r.data); setOffline(false); }
    else if (r.error.code === "OFFLINE") setOffline(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function request() {
    if (working) return;
    setWorking(true);
    const r = await accountApi.requestExport(format);
    setWorking(false);
    if (!r.ok) {
      toast.show(r.error.code === "OFFLINE" ? "You're offline — try again" : "Couldn't prepare your data");
      return;
    }
    await load();
    if (r.data.status === "ready") toast.show("Your data is ready");
  }

  const header = <Header left={<BackButton fallback={`${base}/settings`} />} title="Download your data" />;

  if (!view) {
    return (
      <AppShell header={header}>
        {offline ? (
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
            <Icon name="wifi-off" size={48} className="text-ink-disabled" />
            <p className="text-13 text-ink-tertiary">You&apos;re offline. Reconnect to manage your data.</p>
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <Skeleton className="h-56 w-full rounded-12" />
            <Skeleton className="h-11 w-full rounded-8" />
          </div>
        )}
      </AppShell>
    );
  }

  const current = view.current;
  const preparing = current?.status === "queued" || current?.status === "processing" || working;
  const ready = current?.status === "ready";

  return (
    <AppShell header={header}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 rounded-12 bg-surface-2 p-4">
          <p className="text-13 leading-[1.5] text-ink-secondary">
            Get a copy of your HomzList data — profile, listings, requirements, your own chat messages and payment
            records.
          </p>
          <div className="flex flex-col gap-2 text-13">
            {INCLUDED.map((t) => (
              <span key={t} className="flex items-center gap-2 text-ink-primary">
                <Icon name="check" size={16} className="shrink-0 text-accent" strokeWidth={2} />
                {t}
              </span>
            ))}
            {EXCLUDED.map((t) => (
              <span key={t} className="flex items-center gap-2 text-ink-tertiary">
                <span className="w-4 shrink-0 text-center">—</span>
                {t}
              </span>
            ))}
          </div>
          <p className="text-11 text-ink-tertiary">
            We protect other people&apos;s privacy — only your own messages are included.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-1 text-13 font-semibold text-ink-primary">Format</span>
          {(["json", "csv"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`chrome inline-flex h-8 items-center rounded-full border px-3 text-13 transition-transform active:scale-[0.98] ${
                format === f
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-transparent bg-surface-2 text-ink-primary"
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        {preparing ? (
          <div className="flex items-center gap-3 rounded-12 bg-info-soft p-4">
            <Spinner size={18} />
            <div className="flex flex-col gap-0.5">
              <p className="text-15 font-semibold text-ink-primary">Preparing your data…</p>
              <p className="text-11 text-ink-secondary">
                This usually takes a few minutes. We&apos;ll notify you when it&apos;s ready.
              </p>
            </div>
          </div>
        ) : ready && current ? (
          <div className="flex flex-col gap-2 rounded-12 bg-accent-soft p-4">
            <span className="flex items-center gap-2">
              <Icon name="check" size={22} className="text-accent" strokeWidth={2} />
              <span className="text-15 font-semibold text-ink-primary">Your data is ready</span>
            </span>
            <p className="text-11 text-ink-tertiary">
              {current.fileName} · {formatSize(current.sizeBytes)}
            </p>
            <a
              href={`/api/v1/account/data/${current.id}/download`}
              className="chrome mt-1 inline-flex h-11 w-fit items-center gap-2 rounded-8 bg-accent px-4 text-15 font-semibold text-ink-inverse active:scale-[0.98]"
            >
              <Icon name="download" size={20} />
              Download
            </a>
            <p className="text-11 text-ink-tertiary">{expiryLine(current.expiresAt)}</p>
          </div>
        ) : current?.status === "failed" ? (
          <div className="flex flex-col gap-2 rounded-12 bg-error-soft p-4">
            <span className="flex items-center gap-2 text-15 font-semibold text-error">
              <Icon name="alert" size={20} />
              We couldn&apos;t prepare that export
            </span>
            <p className="text-11 text-ink-secondary">Nothing was sent anywhere. Try again, or contact support.</p>
            <Button className="mt-1 self-start" onClick={() => void request()}>Try again</Button>
          </div>
        ) : (
          <Button fullWidth onClick={() => void request()}>Request data</Button>
        )}

        <div className="flex flex-col">
          <h2 className="mb-2 mt-6 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">
            Previous requests
          </h2>
          {view.previous.length === 0 ? (
            <p className="border-t border-divider py-4 text-13 text-ink-tertiary">
              Nothing yet — this is your first request.
            </p>
          ) : (
            view.previous.map((p) => (
              <div key={p.id} className="flex min-h-12 items-center justify-between border-t border-divider">
                <span className="text-13 text-ink-tertiary">
                  Requested {new Date(p.requestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ·{" "}
                  {p.status === "expired" ? "Expired" : p.status === "failed" ? "Failed" : p.status}
                </span>
                <Button variant="text" size="small" onClick={() => void request()}>Request again</Button>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function expiryLine(iso: string | null): string {
  if (!iso) return "This link expires in 48 hours.";
  const hrs = Math.round((new Date(iso).getTime() - Date.now()) / 3600_000);
  if (hrs <= 0) return "This link has expired — request a new one.";
  if (hrs < 24) return `This link expires in ${hrs} hour${hrs === 1 ? "" : "s"}.`;
  return `This link expires in ${Math.round(hrs / 24)} day${hrs < 48 ? "" : "s"}.`;
}

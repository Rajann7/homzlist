"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/nav/AppShell";
import { Header } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { Callout, List, Row } from "./primitives";
import { supportApi, uploadTicketAttachment } from "@/lib/support/client";
import type { TicketCategory } from "@/lib/support/types";
import { cn } from "@/lib/utils";

/**
 * P12 S2 — Contact support, and the success screen it lands on.
 *
 * The category picker, the conditional field each category reveals and the SLA
 * sentence at the foot of the form all come from ticket_categories, so adding a
 * category (or changing which extra field it asks for) is a data change.
 * Attachments go through the real presign → PUT → commit pipeline before submit,
 * so a screenshot is an object in storage and not a data URL in state.
 */
export function NewTicket({ base = "", initialCategory }: { base?: string; initialCategory?: string }) {
  const router = useRouter();
  const toast = useToast();

  const [cats, setCats] = useState<TicketCategory[] | null>(null);
  const [sheet, setSheet] = useState(false);
  const [code, setCode] = useState<string | null>(initialCategory ?? null);
  const [extra, setExtra] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<Array<{ key: string; url: string; bytes: number }>>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: string; number: string; ackHours: number } | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const r = await supportApi.categories();
      if (r.ok) setCats(r.data.categories);
    })();
  }, []);

  const cat = cats?.find((c) => c.code === code) ?? null;

  const addFile = async (file: File) => {
    if (files.length >= 3) return;
    setUploading(true);
    const r = await uploadTicketAttachment(file);
    setUploading(false);
    if (r.ok) setFiles((f) => [...f, { key: r.key, url: r.url, bytes: r.bytes }]);
    else toast.show(r.error, { variant: "error" });
  };

  const canSubmit =
    Boolean(cat) && subject.trim().length >= 3 && description.trim().length >= 10 && !submitting && !uploading;

  const submit = async () => {
    if (!cat || !canSubmit) return;
    setSubmitting(true);
    const r = await supportApi.create({
      category: cat.code,
      subject: subject.trim(),
      description: description.trim(),
      paymentRef: cat.extraField === "payment_ref" ? extra : null,
      altContact: cat.extraField === "alt_contact" ? extra : null,
      reportLink: cat.extraField === "report_link" ? extra : null,
      attachments: files,
    });
    setSubmitting(false);
    if (r.ok) setCreated({ id: r.data.id, number: r.data.number, ackHours: r.data.ackHours });
    else toast.show(r.error.code === "RATE_LIMITED" ? "Too many tickets — try again later" : "Couldn't submit that", {
      variant: "error",
    });
  };

  /* ------------------------------------------------- S2 ticket-created screen */
  if (created) {
    return (
      <AppShell
        header={
          <Header
            left={<BackButton icon="close" fallback={`${base}/support`} onClick={() => router.replace(`${base}/support`)} />}
            title=""
          />
        }
      >
        <div className="flex flex-col items-center gap-2 px-8 pt-16 text-center">
          <svg width="96" height="96" viewBox="0 0 56 56" aria-hidden="true" className="hz-check">
            <circle
              cx="28" cy="28" r="26" fill="none" stroke="var(--accent)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" className="hz-check-c1"
            />
            <path
              d="M17 29l8 8 15-16" fill="none" stroke="var(--accent)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" className="hz-check-c2"
            />
          </svg>
          <p className="mt-4 text-17 font-semibold text-ink-primary">Ticket #{created.number} created</p>
          <p className="max-w-[280px] text-13 text-ink-secondary">
            We&apos;ve emailed you a confirmation. We&apos;ll reply within {created.ackHours} hours.
          </p>
          <button
            type="button"
            onClick={() => router.replace(`${base}/support/${created.id}`)}
            className="chrome mt-4 inline-flex h-11 min-w-[180px] items-center justify-center rounded-8 bg-accent px-4 text-15 font-semibold text-white active:bg-accent-pressed"
          >
            View ticket
          </button>
        </div>
      </AppShell>
    );
  }

  /* --------------------------------------------------------------- S2 form */
  return (
    <AppShell header={<Header left={<BackButton fallback={`${base}/support`} />} title="Contact support" />}>
      <div className="flex flex-col gap-4 p-4">
        <div>
          <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Category</span>
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="chrome flex h-11 w-full items-center justify-between gap-2 rounded-8 border border-border bg-surface-1 px-3 text-left text-15"
          >
            <span className={cat ? "text-ink-primary" : "text-ink-tertiary"}>{cat?.label ?? "Choose a category"}</span>
            <Icon name="chevron-down" size={20} className="text-ink-tertiary" />
          </button>
        </div>

        {cat?.extraWarning && <Callout tone="warn">{cat.extraWarning}</Callout>}

        {cat?.extraField && (
          <div>
            <span className="mb-1.5 block text-13 font-semibold text-ink-primary">{cat.extraLabel}</span>
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder={
                cat.extraField === "payment_ref"
                  ? "e.g. PAY-88213"
                  : cat.extraField === "alt_contact"
                    ? "+91 · or you@email.com"
                    : "Paste a HomzList profile or listing link"
              }
              className="h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary"
            />
            {cat.extraHint && <p className="mt-1.5 text-11 text-ink-tertiary">{cat.extraHint}</p>}
          </div>
        )}

        <div>
          <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 140))}
            placeholder="One line about your issue"
            className="h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary"
          />
        </div>

        <div>
          <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Description</span>
          <textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
            placeholder="What happened? Include dates, amounts and screenshots if you can."
            className="w-full resize-none rounded-8 border border-border bg-surface-1 p-3 text-15 leading-[1.5] text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary"
          />
          <p className="mt-1 text-right text-11 text-ink-tertiary">{description.length} / 1000</p>
        </div>

        <div>
          <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Attachments</span>
          <div className="flex items-center gap-3">
            {[0, 1, 2].map((i) => {
              const f = files[i];
              return (
                <div key={i} className="relative">
                  <button
                    type="button"
                    onClick={() => !f && picker.current?.click()}
                    className={cn(
                      "relative grid h-[72px] w-[72px] place-items-center gap-1 rounded-8 text-10 text-ink-tertiary",
                      f ? "overflow-hidden border border-border" : "border-[1.5px] border-dashed border-border",
                    )}
                  >
                    {f ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt="" className="h-full w-full rounded-[7px] object-cover" />
                    ) : (
                      <span className="flex flex-col items-center gap-1">
                        <Icon name="image" size={20} />
                        <span className="text-[10px] leading-none">Add screenshot</span>
                      </span>
                    )}
                  </button>
                  {f && (
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={() => setFiles((list) => list.filter((_, k) => k !== i))}
                      className="chrome absolute -right-[7px] -top-[7px] grid h-5 w-5 place-items-center rounded-full bg-ink-primary text-[11px] text-page"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <input
            ref={picker}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void addFile(f);
            }}
          />
          {uploading && <p className="mt-2 text-11 text-ink-tertiary">Uploading…</p>}
        </div>

        <p className="rounded-8 bg-surface-2 p-3 text-11 leading-[1.5] text-ink-tertiary">
          You&apos;ll get a ticket number instantly. We reply within {cat?.ackHours ?? 24} hours (grievance
          complaints: acknowledged in 24 hours, resolved within 15 days).
        </p>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="chrome inline-flex h-11 w-full items-center justify-center gap-2 rounded-8 bg-accent text-15 font-semibold text-white disabled:bg-accent-disabled active:bg-accent-pressed"
        >
          {submitting && <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/35 border-t-white" />}
          {submitting ? "Submitting…" : "Submit ticket"}
        </button>
      </div>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Choose a category">
        <List>
          {(cats ?? [])
            .filter((c) => c.inPicker)
            .map((c) => (
              <Row
                key={c.code}
                icon={c.icon as IconName}
                iconTone="secondary"
                label={c.label}
                chevron={false}
                onClick={() => {
                  setCode(c.code);
                  setExtra("");
                  setSheet(false);
                }}
              />
            ))}
        </List>
      </BottomSheet>
    </AppShell>
  );
}

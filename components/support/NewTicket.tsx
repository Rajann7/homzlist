"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Button, BottomSheet, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { supportApi, type TicketCategory } from "@/lib/content/client";

/**
 * P12 S2b — Contact support.
 *
 * The conditional fields (Payment ID · alternate contact + its warning callout ·
 * link to the user or listing) are driven by FLAGS ON THE CATEGORY ROW, not by
 * a switch on a hardcoded label. An admin adding an eighth category that needs a
 * payment reference gets the field for free, and the server enforces the same
 * three flags — the browser only decides what to draw.
 *
 * `topic` deep-links the category, which is how the Grievance Officer page's
 * "Raise a grievance" arrives with the grievance category already chosen.
 */
export function NewTicket({ base = "", topic }: { base?: string; topic?: string | null }) {
  const router = useRouter();
  const toast = useToast();

  const [categories, setCategories] = useState<TicketCategory[] | null>(null);
  const [grievanceCat, setGrievanceCat] = useState<TicketCategory | null>(null);
  const [picker, setPicker] = useState(false);
  const [chosen, setChosen] = useState<TicketCategory | null>(null);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [altContact, setAltContact] = useState("");
  const [reportLink, setReportLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await supportApi.categories();
    if (!r.ok) return;
    setCategories(r.data.categories);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // A topic in the URL preselects the category. "grievance" is not in the
  // picker (migration 0114) so it is fetched by slug rather than found in the list.
  useEffect(() => {
    if (!topic || !categories) return;
    const inPicker = categories.find((c) => c.slug === topic);
    if (inPicker) { setChosen(inPicker); return; }
    if (topic === "grievance") {
      const g: TicketCategory = {
        slug: "grievance",
        label: "Grievance complaint",
        icon: "shield",
        needsPaymentRef: false,
        needsAltContact: false,
        needsReportLink: true,
        isGrievance: true,
      };
      setGrievanceCat(g);
      setChosen(g);
    }
  }, [topic, categories]);

  const canSubmit = Boolean(
    chosen &&
      subject.trim() &&
      description.trim() &&
      (!chosen.needsPaymentRef || paymentRef.trim()) &&
      (!chosen.needsAltContact || altContact.trim()) &&
      (!chosen.needsReportLink || reportLink.trim()),
  );

  async function submit() {
    if (!chosen || submitting) return;
    setSubmitting(true);
    setError(null);
    const r = await supportApi.create({
      category: chosen.slug,
      subject: subject.trim(),
      description: description.trim(),
      paymentRef: paymentRef.trim() || null,
      altContact: altContact.trim() || null,
      reportLink: reportLink.trim() || null,
    });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error.code === "OFFLINE" ? "You're offline — try again when you reconnect." : "Please check the form and try again.");
      return;
    }
    router.replace(`${base}/help/tickets/${r.data.id}?created=${encodeURIComponent(r.data.number)}`);
  }

  const header = <Header left={<BackButton fallback={`${base}/help`} />} title="Contact support" />;

  if (!categories) {
    return (
      <AppShell header={header}>
        <div className="flex flex-col gap-4 p-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full rounded-8" />)}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <div className="flex flex-col gap-4 p-4">
        {/* Category */}
        <div>
          <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Category</span>
          <button
            onClick={() => setPicker(true)}
            className="chrome flex h-11 w-full items-center justify-between gap-2 rounded-8 border border-border bg-surface-1 px-3 text-left text-15"
          >
            <span className={chosen ? "text-ink-primary" : "text-ink-tertiary"}>
              {chosen?.label ?? "Choose a category"}
            </span>
            <Icon name="chevron-down" size={20} className="text-ink-tertiary" />
          </button>
          {chosen?.isGrievance && (
            <p className="mt-1.5 text-11 leading-[1.5] text-ink-tertiary">
              Grievances are handled under the IT Rules, 2021 — acknowledged within 24 hours with a ticket number,
              resolved within 15 days.
            </p>
          )}
        </div>

        {/* Conditional — payment reference */}
        {chosen?.needsPaymentRef && (
          <div>
            <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Payment ID</span>
            <input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="e.g. pay_RQ8k21LmVn3xYz"
              className={INPUT}
            />
            <p className="mt-1.5 text-11 text-ink-tertiary">
              Find it in Payments → Details ·{" "}
              <button className="chrome text-accent" onClick={() => router.push(`${base}/payments`)}>Open payments</button>
            </p>
          </div>
        )}

        {/* Conditional — number recovery */}
        {chosen?.needsAltContact && (
          <div>
            <div className="mb-3 flex items-start gap-2.5 rounded-8 bg-warning-soft p-3 text-13 leading-[1.5] text-ink-primary">
              <Icon name="alert" size={18} className="mt-px shrink-0 text-warning" />
              <span>You&apos;ll be asked to verify ownership. Our team will contact you on your alternate number or email.</span>
            </div>
            <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Alternate number or email</span>
            <input
              value={altContact}
              onChange={(e) => setAltContact(e.target.value)}
              placeholder="+91 · or you@email.com"
              className={INPUT}
            />
          </div>
        )}

        {/* Conditional — report link */}
        {chosen?.needsReportLink && (
          <div>
            <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Link to the user or listing</span>
            <input
              value={reportLink}
              onChange={(e) => setReportLink(e.target.value)}
              placeholder="Paste a HomzList profile or listing link"
              className={INPUT}
            />
          </div>
        )}

        <div>
          <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 160))}
            placeholder="One line about your issue"
            className={INPUT}
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

        <p className="rounded-8 bg-surface-2 p-3 text-11 leading-[1.5] text-ink-tertiary">
          You&apos;ll get a ticket number instantly. We reply within 24 hours (grievance complaints: acknowledged in
          24 hours, resolved within 15 days).
        </p>

        {error && (
          <div className="flex items-start gap-2.5 rounded-8 bg-error-soft p-3 text-13 text-error">
            <Icon name="alert" size={18} className="mt-px shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button fullWidth disabled={!canSubmit} loading={submitting} onClick={() => void submit()}>
          Submit ticket
        </Button>
      </div>

      <BottomSheet open={picker} onClose={() => setPicker(false)} title="Choose a category">
        <div className="flex flex-col pb-2">
          {(grievanceCat ? [...categories, grievanceCat] : categories).map((c) => (
            <button
              key={c.slug}
              onClick={() => {
                setChosen(c);
                setPicker(false);
                if (!c.needsPaymentRef) setPaymentRef("");
                if (!c.needsAltContact) setAltContact("");
                if (!c.needsReportLink) setReportLink("");
              }}
              className="chrome flex min-h-14 items-center gap-3 px-4 text-left active:bg-surface-2"
            >
              <Icon name={c.icon as never} size={24} className="text-ink-secondary" />
              <span className="flex-1 text-15 text-ink-primary">{c.label}</span>
              {chosen?.slug === c.slug && <Icon name="check" size={20} className="text-accent" strokeWidth={2} />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </AppShell>
  );
}

const INPUT =
  "h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none " +
  "focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary";

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Button, BottomSheet, Skeleton, Spinner, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { supportApi, type TicketCategory } from "@/lib/content/client";
import { apiFetch } from "@/lib/auth/api-fetch";
import { Img } from "@/components/ui/Img";

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

  /**
   * The design's three "Add screenshot" tiles, on the real
   * presign → PUT → commit pipeline the rest of the app uses.
   *
   * `preview` is a local object URL purely so the tile shows the thumbnail the
   * design draws; `key` is the only thing that travels with the ticket. Support
   * screenshots go to the PRIVATE bucket (a failed-payment screenshot routinely
   * has a bank reference in it), so there is no public URL to show even after
   * the upload succeeds — which is why the preview is local.
   */
  const [shots, setShots] = useState<(Shot | null)[]>([null, null, null]);
  const [shotError, setShotError] = useState<string | null>(null);
  const pickerRefs = useRef<(HTMLInputElement | null)[]>([]);

  async function upload(slot: number, file: File) {
    setShotError(null);
    if (file.size > 10 * 1024 * 1024) { setShotError("That image is over 10 MB — try a smaller screenshot."); return; }
    setShots((s) => s.map((v, i) => (i === slot ? { state: "uploading", preview: URL.createObjectURL(file) } : v)));
    try {
      const pre = await apiFetch("/api/v1/uploads/presign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "support", contentType: file.type, size: file.size }),
      }).then((r) => r.json());
      if (!pre.ok) throw new Error(pre.error?.code ?? "presign");

      const put = await fetch(pre.data.grant.url, { method: "PUT", headers: pre.data.grant.headers, body: file });
      if (!put.ok) throw new Error("put");

      const commit = await apiFetch("/api/v1/uploads/commit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "support", key: pre.data.grant.key }),
      }).then((r) => r.json());
      if (!commit.ok) throw new Error(commit.error?.code ?? "commit");

      setShots((s) => s.map((v, i) => (i === slot ? { ...v!, state: "done", key: commit.data.key } : v)));
    } catch (err) {
      setShots((s) => s.map((v, i) => (i === slot ? null : v)));
      setShotError(
        String(err).includes("FILE_TYPE_BLOCKED") ? "That file isn't an image we can accept."
          : String(err).includes("FILE_TOO_LARGE") ? "That image is too large."
          : "Couldn't upload that screenshot — you can still submit without it.",
      );
    }
  }

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
      attachments: shots.filter((s) => s?.state === "done").map((s) => s!.key!),
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

        {/* Attachments — the design's three 72×72 dashed tiles. */}
        <div>
          <span className="mb-1.5 block text-13 font-semibold text-ink-primary">Attachments</span>
          <div className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <AttachmentTile
                key={i}
                slot={shots[i]}
                onPick={() => pickerRefs.current[i]?.click()}
                onRemove={() => setShots((s) => s.map((v, k) => (k === i ? null : v)))}
              />
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              ref={(el) => { pickerRefs.current[i] = el; }}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(i, f); }}
            />
          ))}
          {shotError && <p className="mt-1.5 text-11 text-error">{shotError}</p>}
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

interface Shot {
  state: "uploading" | "done";
  preview: string;
  key?: string;
}

/**
 * One 72×72 attachment tile: dashed + "Add screenshot" when empty, the
 * thumbnail with a ✕ badge when filled — the design's `.upl` / `.upl.up`.
 */
function AttachmentTile({
  slot,
  onPick,
  onRemove,
}: {
  slot: Shot | null;
  onPick: () => void;
  onRemove: () => void;
}) {
  if (!slot) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="chrome flex h-[72px] w-[72px] flex-col items-center justify-center gap-1 rounded-8 border-[1.5px] border-dashed border-border text-10 text-ink-tertiary active:bg-surface-2"
      >
        <Icon name="image" size={20} />
        <span className="text-[10px] leading-none">Add screenshot</span>
      </button>
    );
  }
  return (
    <span className="relative inline-flex h-[72px] w-[72px]">
            <Img src={slot.preview} alt="" className="h-[72px] w-[72px] rounded-8 border border-border object-cover" />
      {slot.state === "uploading" && (
        <span className="absolute inset-0 grid place-items-center rounded-8 bg-black/40 text-white">
          <Spinner size={20} />
        </span>
      )}
      <button
        type="button"
        aria-label="Remove screenshot"
        onClick={onRemove}
        className="chrome absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink-primary text-[11px] text-ink-inverse"
      >
        ✕
      </button>
    </span>
  );
}

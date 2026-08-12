"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheet, Button, Chip, Icon, Skeleton, useToast } from "@/components/billing/ui";
import { useRouter } from "next/navigation";
import { cn, newIdempotencyKey } from "@/lib/utils";
import { navigateAfterClose } from "@/lib/hooks/use-back-close";
import { ago } from "@/components/leads/parts";
import * as leadsApi from "@/lib/leads/client";
import { NumberVerifySheet } from "./NumberVerifySheet";

/**
 * Send Inquiry — the whole connection in three taps.
 *
 * Step 1 WHAT they want · Step 2 HOW to reach them · Step 3 WHEN, then consent
 * and send. There is no message box: the sender never has to compose anything,
 * and the receiver gets a lead they can act on immediately.
 *
 * Everything the sheet renders comes from the server: the chips are rows in
 * `inquiry_options`, the consent text and version come with them, and whether
 * this role may send at all is decided there too — the button is hidden AND the
 * API refuses (a builder can only connect on requirements).
 */

export type InquirySubject =
  | { kind: "listing"; id: string }
  | { kind: "project"; id: string };

export function InquirySheet({
  open,
  onClose,
  subject,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  subject: InquirySubject;
  onSent?: (leadId: string) => void;
}) {
  const toast = useToast();
  const [options, setOptions] = useState<leadsApi.InquiryOptions | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [wants, setWants] = useState<string[]>([]);
  const [contactPref, setContactPref] = useState<"call" | "whatsapp">("call");
  const [number, setNumber] = useState<string | null>(null);
  const [whenToken, setWhenToken] = useState("anytime");
  const [preferredDate, setPreferredDate] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  // One key per opening of the sheet: a double-tap on Send is one lead.
  const [idem, setIdem] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(1); setWants([]); setContactPref("call"); setWhenToken("anytime");
    setPreferredDate(""); setConsent(false); setSending(false); setOptions(null);
    setIdem(newIdempotencyKey());
    void (async () => {
      const res = await leadsApi.inquiryOptions(subject.kind, subject.id);
      if (res.ok) { setOptions(res.data); setNumber(res.data.myNumber); }
    })();
  }, [open, subject.kind]);

  const toggleWant = (code: string) =>
    setWants((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));

  const wantLabels = useMemo(
    () => wants.map((w) => options?.wants.find((o) => o.code === w)?.label ?? w),
    [wants, options],
  );
  const whenLabel = options?.when.find((o) => o.code === whenToken)?.label ?? "";

  const send = useCallback(async () => {
    if (!consent || sending) return;
    setSending(true);
    const res = await leadsApi.sendInquiry({
      [subject.kind === "listing" ? "listingId" : "projectId"]: subject.id,
      wants,
      contactPref,
      contactNumber: number,
      whenToken,
      preferredDate: whenToken === "date" ? preferredDate : null,
      consent: true,
      idempotencyKey: idem,
    } as leadsApi.SendInquiryBody);
    setSending(false);
    if (res.ok) {
      toast.show(res.data.alreadySent ? "Inquiry updated" : "Inquiry sent");
      onSent?.(res.data.leadId);
      onClose();
      return;
    }
    const code = res.error.code;
    if (code === "OFFLINE") { toast.show("You're offline — try again in a moment", { variant: "error" }); return; }
    if (code === "NUMBER_NOT_ALLOWED") { toast.show("Verify that number first", { variant: "error" }); setStep(2); return; }
    if (code === "SELF_ACTION_BLOCKED") { toast.show("This is your own listing"); onClose(); return; }
    if (code === "FORBIDDEN") { toast.show("Your account can't send inquiries here", { variant: "error" }); onClose(); return; }
    if (code === "PROFILE_INCOMPLETE") { toast.show("Add your name and city first", { variant: "error" }); onClose(); return; }
    if (code === "RATE_LIMITED") { toast.show("Too many inquiries today — try tomorrow", { variant: "error" }); return; }
    if (code === "NOT_FOUND") { toast.show("This isn't available any more"); onClose(); return; }
    toast.show("Couldn't send that inquiry", { variant: "error" });
  }, [consent, sending, subject, wants, contactPref, number, whenToken, preferredDate, idem, toast, onSent, onClose]);

  const canContinue = step === 1 ? wants.length > 0 : step === 2 ? Boolean(number) : consent && (whenToken !== "date" || !!preferredDate);

  return (
    <>
      {/* The number popup sits ON TOP of this sheet; this sheet does not close
          for it. Closing it was tearing down a history layer at the same moment
          the popup pushed one, and the resulting popstate shut the popup a frame
          after it appeared — it looked like the button did nothing. Staying open
          is also what a popup means: you come back to Step 2 where you left it. */}
      <BottomSheet open={open} onClose={onClose} hideHeader>
        {!options ? (
          <div className="flex flex-col gap-3 pb-4 pt-2">
            <Skeleton className="h-5 w-32 rounded-8" />
            <Skeleton className="h-10 w-full rounded-8" />
            <Skeleton className="h-11 w-full rounded-8" />
          </div>
        ) : !options.allowed ? (
          <NotForThisRole kind={subject.kind} onClose={onClose} />
        ) : options.existing && !options.existing.withdrawn ? (
          <AlreadySent
            existing={options.existing}
            onClose={onClose}
            onWithdrawn={() => { onSent?.(options.existing?.leadId ?? ""); onClose(); }}
          />
        ) : (
          <div className="flex flex-col pb-2">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-11 font-bold uppercase tracking-wide text-accent">Step {step} of 3</div>
                <h2 className="mt-1 text-15 font-semibold text-ink-primary">
                  {step === 1 ? "What do you want?" : step === 2 ? "How should they contact you?" : "When should they contact you?"}
                </h2>
              </div>
              {step === 1 ? (
                <span className="pt-4 text-12 text-ink-tertiary">Pick one or more</span>
              ) : (
                <button type="button" onClick={() => setStep((s) => (s === 3 ? 2 : 1))} className="chrome pt-4 text-12 font-semibold text-ink-secondary">
                  Back
                </button>
              )}
            </div>

            {step === 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {options.wants.map((o) => (
                  <Chip key={o.code} selected={wants.includes(o.code)} onClick={() => toggleWant(o.code)}>
                    {o.label}
                  </Chip>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="mt-3 flex flex-col gap-2">
                <PickRow
                  icon="phone"
                  title="Call me"
                  subtitle={number ?? "No number on your account"}
                  selected={contactPref === "call"}
                  onClick={() => setContactPref("call")}
                />
                <PickRow
                  icon="whatsapp"
                  title="WhatsApp me"
                  subtitle={number ?? "No number on your account"}
                  selected={contactPref === "whatsapp"}
                  onClick={() => setContactPref("whatsapp")}
                />
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-12 text-ink-secondary">Not this number?</span>
                  <button type="button" onClick={() => setVerifyOpen(true)} className="chrome text-12 font-semibold text-accent">
                    Use a different number
                  </button>
                </div>
                {number && number !== options.myNumber && (
                  <p className="text-11 text-ink-tertiary">
                    Using {number} · verified
                  </p>
                )}
              </div>
            )}

            {step === 3 && (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {options.when.map((o) => (
                    <Chip key={o.code} selected={whenToken === o.code} onClick={() => setWhenToken(o.code)}>
                      {o.label}
                    </Chip>
                  ))}
                </div>
                {whenToken === "date" && (
                  <input
                    type="date"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    className="mt-2 h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary"
                  />
                )}
                <div className="mt-3 rounded-8 border border-divider bg-surface-2 p-3">
                  <div className="text-11 font-bold tracking-wide text-ink-secondary">YOU ARE SHARING</div>
                  <div className="mt-1.5 text-13 leading-relaxed text-ink-primary">
                    Wants: <b>{wantLabels.join(", ")}</b><br />
                    Contact: <b>{contactPref === "call" ? "Call" : "WhatsApp"} · {number}</b><br />
                    Best time: <b>{whenToken === "date" && preferredDate ? preferredDate : whenLabel}</b>
                  </div>
                </div>
              </>
            )}

            {/* Trust notes — short, factual, never alarming. */}
            <div className="mt-3 flex flex-col gap-2">
              {step === 1 && (
                <Note tone="accent" icon="check">
                  Your selected preferences are shared with the owner automatically.
                </Note>
              )}
              {step === 2 && (
                <>
                    <Note icon="lock">Your contact details will only be shared with the person connected to this {subject.kind === "project" ? "project" : "property"}.</Note>
                  <Note icon="phone">The owner may contact you using your selected contact method.</Note>
                </>
              )}
              {step === 3 && <Note icon="clock">Your preferred contact time will be shared with the owner.</Note>}
            </div>

            {step === 3 && (
              <button
                type="button"
                onClick={() => setConsent((c) => !c)}
                className="chrome mt-3 flex items-start gap-2.5 text-left"
                aria-pressed={consent}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border",
                    consent ? "border-accent bg-accent text-white" : "border-border bg-surface-1",
                  )}
                >
                  {consent && <Icon name="check" size={13} />}
                </span>
                <span className="text-13 leading-snug text-ink-primary">{options.consentText}</span>
              </button>
            )}

            <Button
              className="mt-3"
              fullWidth
              disabled={!canContinue}
              loading={sending}
              onClick={() => (step === 3 ? void send() : setStep((s) => (s === 1 ? 2 : 3)))}
            >
              {step === 3 ? <><Icon name="zap" size={16} />Send Inquiry</> : "Continue"}
            </Button>

            <div className="mt-3.5 flex justify-center gap-1.5">
              {[1, 2, 3].map((i) => (
                <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-4 bg-accent" : "w-1.5 bg-border")} />
              ))}
            </div>
          </div>
        )}
      </BottomSheet>

      <NumberVerifySheet
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onVerified={(n) => { setNumber(n); setVerifyOpen(false); }}
      />
    </>
  );
}

/**
 * "You already sent this." The design's own state (screen 16): what was asked
 * for, when, and the two things that are still true — you can look at it in
 * Sent, or cancel it. Cancelling does NOT unshare what was already delivered,
 * and the copy says exactly that rather than implying a recall.
 */
function AlreadySent({
  existing, onClose, onWithdrawn,
}: { existing: leadsApi.ExistingInquiry; onClose: () => void; onWithdrawn: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col pb-2">
      <div className="flex items-center gap-2">
        <Icon name="check-circle" size={18} className="text-accent" />
        <h2 className="flex-1 text-15 font-semibold text-ink-primary">Inquiry already sent</h2>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-11 font-semibold text-accent">{ago(existing.sentAt)}</span>
      </div>

      <p className="mt-2 text-13 leading-snug text-ink-secondary">
        You asked for {existing.wants.map((w) => w.label).join(", ") || "details"} ·{" "}
        {existing.contactPref === "whatsapp" ? "WhatsApp" : "Call"}
        {existing.whenLabel ? ` · ${existing.whenLabel}` : ""}. The owner has your details.
      </p>

      <div className="mt-3 flex gap-2">
        {/* Closing the sheet fires an async history.back(); a router.push() in the
            same tick is swallowed by it and the button reads as dead. Ride the pop. */}
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => { onClose(); navigateAfterClose(() => router.push("/leads?tab=sent")); }}
        >
          View in Sent
        </Button>
        <Button
          variant="outline"
          className="flex-1 border-error/30 text-error"
          loading={busy}
          disabled={!existing.leadId}
          onClick={async () => {
            if (!existing.leadId) return;
            setBusy(true);
            const res = await leadsApi.withdraw(existing.leadId);
            setBusy(false);
            if (!res.ok) { toast.show("Couldn't cancel that", { variant: "error" }); return; }
            toast.show("Request cancelled");
            onWithdrawn();
          }}
        >
          Cancel request
        </Button>
      </div>
      <p className="mt-2 text-11 leading-snug text-ink-tertiary">
        Your details have already been shared and cannot be recalled. Cancelling only stops further contact through HomzList.
      </p>
    </div>
  );
}

/**
 * A builder reaches the market through REQUIREMENTS, never by inquiring on
 * someone else's property or project (Doc2 role rules). The server refuses it;
 * this is the half the person actually sees, so the refusal arrives before they
 * have filled anything in — and it points at the thing they CAN do.
 */
function NotForThisRole({ kind, onClose }: { kind: "listing" | "project"; onClose: () => void }) {
  const router = useRouter();
  return (
    <div className="flex flex-col pb-2">
      <div className="flex items-center gap-2">
        <Icon name="info" size={18} className="text-warning" />
        <h2 className="text-15 font-semibold text-ink-primary">Builders answer requirements</h2>
      </div>
      <p className="mt-2 text-13 leading-snug text-ink-secondary">
        A builder account can&apos;t send an inquiry on someone else&apos;s {kind === "project" ? "project" : "property"}.
        Buyers come to you through your projects, and you reach them by answering their requirements.
      </p>
      <Button className="mt-3" fullWidth onClick={() => { onClose(); router.push("/requirements"); }}>
        Browse requirements
      </Button>
    </div>
  );
}

function PickRow({
  icon, title, subtitle, selected, onClick,
}: { icon: "phone" | "whatsapp"; title: string; subtitle: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "chrome flex items-center gap-2.5 rounded-12 border p-3 text-left",
        selected ? "border-accent bg-accent-soft" : "border-border bg-surface-1",
      )}
    >
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border", selected ? "border-accent bg-accent text-white" : "border-border")}>
        {selected && <Icon name="check" size={12} />}
      </span>
      <Icon name={icon} size={20} className={icon === "whatsapp" ? "text-[#25D366]" : "text-accent"} />
      <span className="min-w-0">
        <span className="block text-14 font-semibold text-ink-primary">{title}</span>
        <span className="block truncate text-12 text-ink-secondary">{subtitle}</span>
      </span>
    </button>
  );
}

function Note({
  children, icon, tone = "muted",
}: { children: React.ReactNode; icon: "lock" | "phone" | "clock" | "check" | "info"; tone?: "muted" | "accent" }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-8 border p-2.5 text-12 leading-snug",
        tone === "accent"
          ? "border-accent/25 bg-accent-soft text-accent"
          : "border-divider bg-surface-2 text-ink-secondary",
      )}
    >
      <Icon name={icon} size={14} className="mt-0.5 shrink-0 opacity-80" />
      <span>{children}</span>
    </p>
  );
}

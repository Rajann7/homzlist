"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet, Button, Icon, useToast } from "@/components/billing/ui";
import { Avatar } from "@/components/ui/Avatar";
import { Img } from "@/components/ui/Img";
import { cn } from "@/lib/utils";
import * as leadsApi from "@/lib/leads/client";

/**
 * Shared lead furniture: the kind colours, the status pill, the Call/WhatsApp
 * action row and the report sheet.
 *
 * The action row is the important one. Tapping Call or WhatsApp records a
 * contact event server-side BEFORE handing off to the dialler — with no chat in
 * the product that event is the only evidence a connection happened, and it is
 * what moves the lead out of New without the owner having to bookkeep.
 */

export const KIND = {
  listing: { chip: "bg-accent-soft text-accent", label: "Property" },
  project: { chip: "bg-info-soft text-info", label: "Project" },
  requirement: { chip: "bg-warning-soft text-warning", label: "Requirement" },
} as const;

const STATUS_TONE: Record<string, string> = {
  new: "bg-accent-soft text-accent",
  contacted: "bg-info-soft text-info",
  converted: "bg-accent-soft text-accent",
  archived: "bg-surface-3 text-ink-secondary",
  overdue: "bg-warning-soft text-warning",
  sent: "bg-accent-soft text-accent",
  seen: "bg-info-soft text-info",
  closed: "bg-surface-3 text-ink-secondary",
};

export function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={cn("chrome shrink-0 rounded-full px-2 py-0.5 text-11 font-semibold", STATUS_TONE[tone] ?? STATUS_TONE.closed)}>
      {children}
    </span>
  );
}

/** Subject thumbnail — cover when there is one, kind glyph when there isn't. */
export function SubjectThumb({
  kind, coverUrl, size = 48,
}: { kind: "listing" | "project" | "requirement"; coverUrl: string | null; size?: number }) {
  return (
    <div
      className={cn("shrink-0 overflow-hidden rounded-8", coverUrl ? "bg-surface-3" : KIND[kind].chip, "grid place-items-center")}
      style={{ width: size, height: size }}
    >
      {coverUrl
        ? <Img src={coverUrl} alt="" className="h-full w-full object-cover" />
        : <Icon name={kind === "requirement" ? "search" : kind === "project" ? "building" : "home"} size={Math.round(size / 2.4)} />}
    </div>
  );
}

export function PersonRow({
  person, meta, right,
}: {
  person: { name: string; photoUrl: string | null; role: string | null };
  meta: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar src={person.photoUrl} name={person.name} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-13 font-semibold text-ink-primary">{person.name}</span>
          {right}
        </div>
        <div className="mt-0.5 truncate text-12 text-ink-secondary">{meta}</div>
      </div>
    </div>
  );
}

/**
 * The ⋯ on a lead card.
 *
 * The list screen shows LEADS, not a row of dial buttons per lead — reading
 * eight cards should be reading eight people, not scanning sixteen buttons.
 * Everything you can do to a lead lives behind this one control, and calling
 * happens on the lead's own screen where you can see who you are calling.
 */
export function LeadMenu({ lead, onChanged }: { lead: leadsApi.LeadView; onChanged?: () => void }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Lead options"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenu(true); }}
        className="chrome -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-tertiary active:bg-surface-2"
      >
        <Icon name="more" size={18} />
      </button>

      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Lead options">
        <div className="flex flex-col pb-2">
          <MenuRow icon="user" label="View profile" onClick={() => { void leadsApi.recordContact(lead.id, "profile"); router.push(`/u/${lead.person.id}`); }} />
          <MenuRow icon="check-circle" label="Mark as converted" onClick={async () => { await leadsApi.setStatus(lead.id, "converted"); setMenu(false); onChanged?.(); }} />
          <MenuRow icon="archive" label="Archive lead" onClick={async () => { await leadsApi.setStatus(lead.id, "archived"); setMenu(false); onChanged?.(); }} />
          <MenuRow icon="eye-off" label="Not relevant" onClick={async () => { await leadsApi.notRelevant(lead.id); setMenu(false); onChanged?.(); }} />
          <MenuRow icon="flag" label="Report this lead" danger onClick={() => { setMenu(false); setReport(true); }} />
        </div>
      </BottomSheet>

      <ReportLeadSheet open={report} onClose={() => setReport(false)} leadId={lead.id} onDone={() => onChanged?.()} />
    </>
  );
}

/**
 * How you actually reach this person — and ONLY how they asked to be reached.
 *
 * Offering both Call and WhatsApp ignores the one thing the sender told us.
 * The other channel stays available behind the ⋯ for the case where the first
 * one does not connect, but it is not the thing on the screen.
 *
 * Both links are built on the server (lib/leads/service) so the WhatsApp
 * message is already written: who they are, which post, what they asked for.
 */
export function LeadContact({ lead, onChanged }: { lead: leadsApi.LeadView; onChanged?: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const prefersWhatsapp = lead.contactPref === "whatsapp";

  const go = async (channel: "call" | "whatsapp") => {
    const href = channel === "whatsapp" ? lead.whatsappHref : lead.callHref;
    if (!href) { toast.show("No number on this lead"); return; }
    await leadsApi.recordContact(lead.id, channel);
    onChanged?.();
    window.location.href = href;
  };

  return (
    <div className="mt-3 flex gap-2">
      <Button className="flex-1" onClick={() => void go(prefersWhatsapp ? "whatsapp" : "call")}>
        <Icon name={prefersWhatsapp ? "whatsapp" : "phone"} size={17} />
        {prefersWhatsapp ? "WhatsApp" : "Call"}
      </Button>
      <Button
        variant="outline"
        className="w-11 px-0"
        aria-label="View profile"
        onClick={() => { void leadsApi.recordContact(lead.id, "profile"); router.push(`/u/${lead.person.id}`); }}
      >
        <Icon name="user" size={17} />
      </Button>
      <Button
        variant="outline"
        className="w-11 px-0"
        aria-label={prefersWhatsapp ? "Call instead" : "WhatsApp instead"}
        onClick={() => void go(prefersWhatsapp ? "call" : "whatsapp")}
      >
        <Icon name={prefersWhatsapp ? "phone" : "whatsapp"} size={17} className={prefersWhatsapp ? undefined : "text-[#25D366]"} />
      </Button>
    </div>
  );
}

function MenuRow({
  icon, label, onClick, danger,
}: { icon: Parameters<typeof Icon>[0]["name"]; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chrome flex h-12 items-center gap-3 border-b border-divider text-left last:border-0"
    >
      <Icon name={icon} size={18} className={danger ? "text-error" : "text-ink-secondary"} />
      <span className={cn("text-14", danger ? "text-error" : "text-ink-primary")}>{label}</span>
    </button>
  );
}

/**
 * Report a lead. The reasons are the moderation vocabulary; the report lands in
 * the SAME admin queue as listing/user reports (subject_type='lead'), so there
 * is one place moderation happens.
 */
export function ReportLeadSheet({
  open, onClose, leadId, onDone,
}: { open: boolean; onClose: () => void; leadId: string; onDone?: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const REASONS = [
    { code: "spam", label: "Spam or repeated inquiries" },
    { code: "fake", label: "Fake or time-wasting inquiry" },
    { code: "abusive", label: "Abusive or harassing" },
    { code: "wrong_number", label: "Wrong or someone else's number" },
    { code: "broker", label: "Broker posing as a buyer" },
    { code: "other", label: "Something else" },
  ];

  async function submit() {
    setBusy(true);
    const res = await leadsApi.reportLead(leadId, reason, note.trim() || undefined);
    setBusy(false);
    if (!res.ok) { toast.show("Couldn't send that report", { variant: "error" }); return; }
    toast.show(res.data.alreadyReported ? "You've already reported this" : "Reported — our team will review it");
    onDone?.();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Report this lead">
      <div className="flex flex-col gap-2 pb-2">
        {REASONS.map((r) => (
          <button
            key={r.code}
            type="button"
            onClick={() => setReason(r.code)}
            className={cn(
              "chrome flex items-center gap-2.5 rounded-12 border p-3 text-left text-14",
              reason === r.code ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-1 text-ink-primary",
            )}
          >
            <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border", reason === r.code ? "border-accent bg-accent text-white" : "border-border")}>
              {reason === r.code && <Icon name="check" size={12} />}
            </span>
            {r.label}
          </button>
        ))}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          placeholder="Anything else we should know? (optional)"
          className="mt-1 min-h-[72px] rounded-8 border border-border bg-surface-1 p-3 text-13 text-ink-primary outline-none placeholder:text-ink-tertiary"
        />
        <p className="text-11 text-ink-tertiary">
          The inquiry details and the numbers shared are included so our team can review it.
        </p>
        <Button fullWidth disabled={!reason} loading={busy} onClick={() => void submit()}>Send report</Button>
      </div>
    </BottomSheet>
  );
}

/** "2 hours ago" — short, IST-safe relative time. */
export function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

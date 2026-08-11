"use client";

import { InquirySheet as ConnectSheet } from "@/components/inquiry/InquirySheet";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { SheetOption } from "@/components/billing/primitives";
import { interactionsApi, type FeedCard } from "@/lib/feed/client";
import { listingsApi } from "@/lib/listings/client";
import { cn } from "@/lib/utils";
import { usePublicOrigin } from "@/lib/hooks/use-public-href";
import { currentPath, loginHref } from "@/lib/auth/next-url";
import { Img } from "@/components/ui/Img";

// ---- Sort sheet (P2 S1) ----------------------------------------------------
const SORTS = [
  { key: "latest", label: "Latest" },
  { key: "nearby", label: "Nearby" },
  { key: "price_asc", label: "Price: Low to High" },
  { key: "price_desc", label: "Price: High to Low" },
];
export function SortSheet({ open, onClose, value, onChange }: { open: boolean; onClose: () => void; value: string; onChange: (v: string) => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Sort by">
      <div className="flex flex-col pb-2">
        {SORTS.map((s) => (
          <button key={s.key} onClick={() => { onChange(s.key); onClose(); }} className={cn("flex items-center justify-between rounded-8 px-3 py-3 text-left text-15", value === s.key ? "text-accent" : "text-ink-primary")}>
            {s.label}{value === s.key && <Icon name="check" size={18} />}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

// ---- ⋯ sheet (Share / Report / Not-interested) -----------------------------
export function MoreSheet({
  open, onClose, onShare, onReport,
}: { open: boolean; onClose: () => void; onShare: () => void; onReport: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Options">
      <div className="flex flex-col pb-2">
        <SheetOption icon={<Icon name="share" size={22} className="text-ink-secondary" />} label="Share" onClick={onShare} />
        <SheetOption icon={<Icon name="alert" size={22} className="text-error" />} label="Report" destructive onClick={onReport} />
        {/* "Not interested" was removed on Rajan's instruction (28 Jul 2026).
            It also never worked on a project card: `feed_not_interested.
            type_code` points at property_types, so a project could persist
            nothing and the card came straight back on the next refresh. */}
      </div>
    </BottomSheet>
  );
}

// ---- Share sheet -----------------------------------------------------------
export function ShareSheet({ open, onClose, card }: { open: boolean; onClose: () => void; card: FeedCard | null }) {
  const toast = useToast();
  // ALWAYS the main domain, never the host we happen to be on. This sheet is
  // opened from the feed, the detail screens and the builder's own screens —
  // all of which run on seller.* for a signed-in user, so the link that went
  // out on WhatsApp was seller.homzlist.com/property/…, which is gated and
  // bounces every recipient to a login screen. A share is a public link.
  const origin = usePublicOrigin();
  const link = card ? `${origin}/${card.kind === "project" ? "project" : "property"}/${card.id}` : "";

  // The Shares metric on P9 S5 counts what actually happened here. Fire-and-
  // forget: a share must never wait on (or be blocked by) analytics. Projects
  // have no shares table, so only a property records one.
  const record = (channel: "copy" | "whatsapp" | "native") => {
    if (!card || card.kind === "project") return;
    void listingsApi.recordShare(card.id, channel);
  };
  const copy = () => { void navigator.clipboard?.writeText(link); record("copy"); toast.show("Link copied"); };

  // What actually gets sent on WhatsApp. It used to be the bare URL, which
  // arrives as an unreadable link with no idea what it is (Rajan, 28 Jul 2026):
  // the message now names the property/project and its price, then the link.
  const shareText = card
    ? `${card.title ?? card.meta ?? "This property"}${card.areaLabel ? ` at ${card.areaLabel}` : ""}${
        card.price || card.priceBand || card.priceFrom ? ` — ${card.price ?? card.priceBand ?? card.priceFrom}` : ""
      }. More details: ${link}`
    : link;
  return (
    <BottomSheet open={open} onClose={onClose} title="Share">
      {card && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex items-center gap-3 rounded-8 bg-surface-2 p-3">
            <span className="h-12 w-12 overflow-hidden rounded-8 bg-surface-3">{card.coverUrl && <Img src={card.coverUrl} alt="" className="h-full w-full object-cover" />}</span>
            <div className="min-w-0">
              <div className="truncate text-13 font-semibold text-ink-primary">{card.title ?? `${card.meta ?? ""}`}</div>
              <div className="text-11 text-ink-tertiary">{card.price ?? card.priceBand ?? card.priceFrom}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-8 border border-border px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-13 text-ink-tertiary">{link}</span>
            <button onClick={copy} className="text-13 font-semibold text-accent">Copy</button>
          </div>
          <div className="flex justify-around">
            <ShareDest icon="message" label="WhatsApp" onClick={() => { record("whatsapp"); window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank"); }} />
            <ShareDest icon="copy" label="Copy Link" onClick={copy} />
            <ShareDest icon="share" label="More" onClick={() => { if (navigator.share) { record("native"); void navigator.share({ text: shareText, url: link }); } else copy(); }} />
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
function ShareDest({ icon, label, onClick }: { icon: "message" | "copy" | "share"; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-14 flex-col items-center gap-1.5">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-primary"><Icon name={icon} size={22} /></span>
      <span className="text-11 text-ink-secondary">{label}</span>
    </button>
  );
}

// ---- Report sheet ----------------------------------------------------------
const REASONS = [
  { key: "fake", label: "Fake listing" },
  { key: "sold", label: "Already sold" },
  { key: "wrong_price", label: "Wrong price" },
  { key: "wrong_photos", label: "Wrong photos" },
  { key: "abusive", label: "Abusive content" },
  { key: "duplicate", label: "Duplicate listing" },
];
export function ReportSheet({ open, onClose, card }: { open: boolean; onClose: () => void; card: FeedCard | null }) {
  const toast = useToast();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!card || !reason) return;
    setBusy(true);
    const res = await interactionsApi.report(card.kind === "project" ? "project" : "listing", card.id, reason, note.trim() || null);
    setBusy(false);
    onClose(); setReason(null); setNote("");
    toast.show(res.ok ? "Report submitted — we'll review it" : "Couldn't submit that");
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Report this listing">
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex flex-col">
          {REASONS.map((r) => (
            <button key={r.key} onClick={() => setReason(r.key)} className="flex items-center justify-between border-b border-divider py-3 text-left text-15 text-ink-primary last:border-0">
              {r.label}
              <span className={cn("grid h-5 w-5 place-items-center rounded-full border", reason === r.key ? "border-accent bg-accent" : "border-border")}>{reason === r.key && <Icon name="check" size={12} className="text-white" />}</span>
            </button>
          ))}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add details (optional)" className="w-full resize-none rounded-8 border border-border bg-surface-1 p-3 text-15 text-ink-primary outline-none focus:border-accent" />
        <Button fullWidth variant="destructive" disabled={!reason} loading={busy} onClick={() => void submit()}>Submit Report</Button>
      </div>
    </BottomSheet>
  );
}

// ---- Inquiry sheet ---------------------------------------------------------
/**
 * The feed's "Send Inquiry" is the SAME sheet the detail screens open — three
 * taps (what / how / when), consent, send. It used to be a composer that grew a
 * chat thread; that whole idea is gone, so this is now a thin adapter that keeps
 * every existing call site working while there is exactly one inquiry UI in the
 * product (a second copy is how the two drift apart).
 *
 * A feed card is only ever a property or a project here; a requirement is
 * answered with a proposal, which is its own sheet.
 */
export function InquirySheet({ open, onClose, card }: { open: boolean; onClose: () => void; card: FeedCard | null; unitId?: string }) {
  if (!card) return null;
  return (
    <ConnectSheet
      open={open}
      onClose={onClose}
      subject={card.kind === "project" ? { kind: "project", id: card.id } : { kind: "listing", id: card.id }}
    />
  );
}

// ---- Guest login sheet -----------------------------------------------------
export function LoginSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} hideHeader>
      <div className="flex flex-col items-center gap-4 py-4">
        <span className="text-20 font-bold"><span className="text-ink-primary">Homz</span><span className="text-accent">List</span></span>
        <p className="text-center text-15 text-ink-secondary">Sign in to continue — save properties, send inquiries and chat securely.</p>
        {/* Signing in changes who the session belongs to, so this has to be a
            real page load — router.push() would keep the guest render tree. */}
        <Button
          fullWidth
          onClick={() => {
            // …and back to this exact screen afterwards. The sheet opens on top
            // of whatever the guest was trying to do (save, inquire, report), so
            // the page they are on IS the thing to return to.
            location.href = loginHref(currentPath());
          }}
        >
          Continue with phone
        </Button>
      </div>
    </BottomSheet>
  );
}

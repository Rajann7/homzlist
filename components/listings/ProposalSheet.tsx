"use client";

import { useCallback, useEffect, useState } from "react";
import { BottomSheet, Button, Icon, Skeleton, useToast } from "@/components/billing/ui";
import { TopupSheet } from "@/components/billing/TopupSheet";
import { proposalsApi } from "@/lib/listings/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * P8 S3 — Send Proposal sheet (Doc7 §70).
 *
 * Two options: "I have a property" (attach one of your live listings) or "Can we
 * chat". The balance, the duplicate state and the listing list all come from the
 * server (`proposalsApi.sheet`) — the client never decides whether a send is
 * allowed. When the pool is empty the send returns NEED_TOPUP and the inline
 * TopupSheet opens (no navigation away); on success the proposal auto-sends.
 */
export function ProposalSheet({
  open,
  onClose,
  requirementId,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  requirementId: string;
  /** Fired after a successful send so the parent can flip the card to "sent". */
  onSent?: (balanceLeft: number) => void;
}) {
  const toast = useToast();
  type Sheet = {
    balance: { left: number; total: number; unlimited: boolean };
    /** false = builder with no LIVE project (0087) — the send would 403. */
    canPropose: boolean;
    alreadySent: boolean;
    listings: { id: string; title: string | null; priceLabel: string; areaLabel: string | null; coverUrl: string | null }[];
    prefill: { listing: string; chat: string };
  };
  const [data, setData] = useState<Sheet | null>(null);
  const [mode, setMode] = useState<"listing" | "chat">("chat");
  const [pickedListing, setPickedListing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [topup, setTopup] = useState(false);

  const load = useCallback(async () => {
    const res = await proposalsApi.sheet(requirementId);
    if (res.ok) {
      setData(res.data);
      // Default option: "I have a property" only if they actually have listings.
      const startMode = res.data.listings.length ? "listing" : "chat";
      setMode(startMode);
      setPickedListing(res.data.listings.length ? res.data.listings[0].id : null);
      setMessage(startMode === "listing" ? res.data.prefill.listing : res.data.prefill.chat);
    }
  }, [requirementId]);

  useEffect(() => {
    if (!open) { setData(null); setSending(false); setTopup(false); return; }
    void load();
  }, [open, load]);

  function chooseMode(next: "listing" | "chat") {
    setMode(next);
    if (!data) return;
    // Only replace the message if it's still the untouched prefill of the other option.
    setMessage((cur) =>
      cur === data.prefill.listing || cur === data.prefill.chat || cur.trim() === ""
        ? data.prefill[next]
        : cur,
    );
    if (next === "listing" && !pickedListing && data.listings.length) setPickedListing(data.listings[0].id);
  }

  const doSend = useCallback(async () => {
    setSending(true);
    const res = await proposalsApi.send(requirementId, {
      mode,
      listingId: mode === "listing" ? pickedListing : null,
      message,
    });
    setSending(false);
    if (res.ok) {
      toast.show(`Proposal sent — ${res.data.balanceLeft} remaining`);
      onSent?.(res.data.balanceLeft);
      onClose();
      return;
    }
    if (res.error.code === "NEED_TOPUP") { setTopup(true); return; }
    if (res.error.code === "DUPLICATE_PROPOSAL") { toast.show("You've already sent a proposal for this requirement"); void load(); return; }
    if (res.error.code === "SELF_ACTION_BLOCKED") { toast.show("You can't propose to your own requirement"); onClose(); return; }
    // A builder's project went down (or was never live) between opening the
    // sheet and sending — re-read so the sheet shows the blocked state.
    if (res.error.code === "PROJECT_REQUIRED") { toast.show("Publish a project first to send proposals", { variant: "error" }); void load(); return; }
    if (res.error.code === "OFFLINE") { toast.show("You're offline"); return; }
    toast.show("Couldn't send that proposal");
  }, [requirementId, mode, pickedListing, message, toast, onSent, onClose, load]);

  const balance = data?.balance;
  const exhausted = balance ? !balance.unlimited && balance.left <= 0 : false;
  const remainLabel = balance
    ? balance.unlimited ? "Unlimited proposals" : `${balance.left} proposal${balance.left === 1 ? "" : "s"} remaining`
    : "";

  return (
    <>
      <BottomSheet open={open && !topup} onClose={onClose} title="Send Proposal">
        {!data ? (
          <div className="flex flex-col gap-3 pb-4">
            <Skeleton className="h-[72px] w-full rounded-12" />
            <Skeleton className="h-[72px] w-full rounded-12" />
            <Skeleton className="h-24 w-full rounded-8" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            {/* Option cards (radio) */}
            <OptionCard
              icon="home"
              title="I have a property"
              subtitle="Attach one of your live listings"
              selected={mode === "listing"}
              disabled={data.alreadySent}
              onClick={() => chooseMode("listing")}
            />
            {mode === "listing" && (
              <div className="-mt-1 flex flex-col gap-2">
                {data.listings.length === 0 ? (
                  <p className="rounded-8 bg-surface-2 px-3 py-2.5 text-11 text-ink-secondary">
                    You have no live listings to attach. Send a chat request instead.
                  </p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {data.listings.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setPickedListing(l.id)}
                        className={cn(
                          "flex w-[160px] shrink-0 flex-col overflow-hidden rounded-8 border bg-surface-1 text-left",
                          pickedListing === l.id ? "border-accent" : "border-border",
                        )}
                      >
                        <div className="relative h-20 w-full bg-surface-3">
                          {l.coverUrl && <Img src={l.coverUrl} alt="" className="h-full w-full object-cover" />}
                          {pickedListing === l.id && (
                            <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
                              <Icon name="check" size={12} />
                            </span>
                          )}
                        </div>
                        <div className="p-2">
                          <div className="text-11 font-semibold text-ink-primary">{l.priceLabel} · {l.title ?? "Listing"}</div>
                          <div className="truncate text-11 text-ink-tertiary">{l.areaLabel ?? ""}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setPickedListing(null); chooseMode("chat"); }}
                  className="self-start text-11 font-semibold text-accent"
                >
                  No matching listing? Send a suggestion instead
                </button>
              </div>
            )}

            <OptionCard
              icon="message"
              title="Can we chat"
              subtitle="Send a plain request to discuss"
              selected={mode === "chat"}
              disabled={data.alreadySent}
              onClick={() => chooseMode("chat")}
            />

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={1000}
              disabled={data.alreadySent}
              className="w-full resize-none rounded-8 border border-border bg-surface-1 p-3 text-15 text-ink-primary outline-none focus:border-accent disabled:opacity-50"
              placeholder="Add a short message"
            />

            {/* Duplicate guard */}
            {data.alreadySent && (
              <div className="flex items-center gap-2 rounded-8 bg-warning-soft px-3 py-2.5">
                <Icon name="alert" size={16} className="shrink-0 text-warning" />
                <span className="text-11 text-ink-secondary">You&apos;ve already sent a proposal for this requirement</span>
              </div>
            )}

            {/* Builder with no LIVE project (0087) — a plan alone doesn't earn
                the send, a published project does. */}
            {!data.canPropose && !data.alreadySent && (
              <div className="flex items-center gap-2 rounded-8 bg-warning-soft px-3 py-2.5">
                <Icon name="alert" size={16} className="shrink-0 text-warning" />
                <span className="text-11 text-ink-secondary">Publish a project first — proposals come with your project.</span>
              </div>
            )}

            {/* Footer: remaining + send / top-up */}
            {exhausted && !data.alreadySent && (
              <div className="flex items-center gap-2 rounded-8 bg-error-soft px-3 py-2.5">
                <Icon name="alert" size={16} className="shrink-0 text-error" />
                <span className="text-11 text-error">0 proposals remaining — add more to send</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-11 text-ink-tertiary">{remainLabel}</span>
              {exhausted && data.canPropose ? (
                <Button className="flex-1 max-w-[220px]" onClick={() => setTopup(true)} disabled={data.alreadySent}>
                  Add 10 proposals — ₹499
                </Button>
              ) : (
                <Button
                  className="flex-1 max-w-[220px]"
                  loading={sending}
                  disabled={!data.canPropose || data.alreadySent || (mode === "listing" && !pickedListing && data.listings.length > 0)}
                  onClick={() => void doSend()}
                >
                  Send Proposal
                </Button>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Inline top-up — on success it auto-sends the proposal (no nav away). */}
      <TopupSheet
        open={topup}
        autoSend
        onClose={() => setTopup(false)}
        onDone={() => { setTopup(false); void doSend(); }}
      />
    </>
  );
}

function OptionCard({
  icon, title, subtitle, selected, disabled, onClick,
}: { icon: "home" | "message"; title: string; subtitle: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-12 border p-3 text-left transition-colors",
        selected ? "border-accent bg-accent-soft" : "border-border bg-surface-1",
        disabled && "opacity-50",
      )}
    >
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", selected ? "bg-accent text-white" : "bg-surface-2 text-ink-secondary")}>
        <Icon name={icon} size={20} />
      </span>
      <span className="flex-1">
        <span className="block text-15 font-semibold text-ink-primary">{title}</span>
        <span className="block text-11 text-ink-tertiary">{subtitle}</span>
      </span>
      <span className={cn("grid h-5 w-5 place-items-center rounded-full border", selected ? "border-accent bg-accent" : "border-border")}>
        {selected && <Icon name="check" size={12} className="text-white" />}
      </span>
    </button>
  );
}

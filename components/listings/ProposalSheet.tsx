"use client";

import { useCallback, useEffect, useState } from "react";
import { BottomSheet, Button, Chip, Icon, Skeleton, useToast } from "@/components/billing/ui";
import { TopupSheet } from "@/components/billing/TopupSheet";
import { NumberVerifySheet } from "@/components/inquiry/NumberVerifySheet";
import { proposalsApi } from "@/lib/listings/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * P8 S3 — Send Proposal, rebuilt for the connection system.
 *
 * The sheet opens on the two ways to answer a requirement, with the quota
 * above them:
 *
 *   I Have a Property  → offer one of your live listings or projects
 *   I Can Arrange It   → no listing yet; say what you can offer
 *
 * Both then take the same three answers a property inquiry takes (what / how /
 * when) and the same consent, because both share the sender's number with the
 * requirement owner. There is no message box and nothing for the owner to
 * accept: the send creates a lead they act on with Call or WhatsApp.
 *
 * Everything comes from the server — balance, eligibility, the option chips and
 * the consent wording — so the client never decides whether a send is allowed
 * or what the choices are. Empty pool still returns NEED_TOPUP and opens the
 * inline top-up sheet rather than navigating away.
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
  type Post = { id: string; title: string | null; priceLabel: string; areaLabel: string | null; coverUrl: string | null };
  type Sheet = {
    balance: { left: number; total: number; unlimited: boolean };
    /** false = builder with no LIVE project (0087) — the send would 403. */
    canPropose: boolean;
    alreadySent: boolean;
    listings: Post[];
    projects: Post[];
    offers: { code: string; label: string }[];
    when: { code: string; label: string }[];
    consentText: string;
    consentVersion: string;
    myNumber: string | null;
  };

  const [data, setData] = useState<Sheet | null>(null);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [mode, setMode] = useState<"listing" | "help">("listing");
  const [picked, setPicked] = useState<{ kind: "listing" | "project"; id: string } | null>(null);
  const [offers, setOffers] = useState<string[]>([]);
  const [contactPref, setContactPref] = useState<"call" | "whatsapp">("call");
  const [number, setNumber] = useState<string | null>(null);
  const [whenToken, setWhenToken] = useState("anytime");
  const [preferredDate, setPreferredDate] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [topup, setTopup] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await proposalsApi.sheet(requirementId);
    if (res.ok) {
      const d = res.data as Sheet;
      setData(d);
      setNumber(d.myNumber);
      // Default to the option they can actually use.
      setMode(d.listings.length || d.projects.length ? "listing" : "help");
    }
  }, [requirementId]);

  useEffect(() => {
    if (!open) { setData(null); setSending(false); setTopup(false); return; }
    setStep(0); setPicked(null); setOffers([]); setContactPref("call");
    setWhenToken("anytime"); setPreferredDate(""); setConsent(false);
    void load();
  }, [open, load]);

  const doSend = useCallback(async () => {
    if (!consent) return;
    setSending(true);
    const res = await proposalsApi.send(requirementId, {
      mode,
      listingId: mode === "listing" && picked?.kind === "listing" ? picked.id : null,
      projectId: mode === "listing" && picked?.kind === "project" ? picked.id : null,
      offers: mode === "help" ? offers : [],
      contactPref,
      contactNumber: number,
      whenToken,
      preferredDate: whenToken === "date" ? preferredDate : null,
      consent: true,
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
    if (res.error.code === "NUMBER_NOT_ALLOWED") { toast.show("Verify that number first", { variant: "error" }); setStep(2); return; }
    // A builder's project went down (or was never live) between opening the
    // sheet and sending — re-read so the sheet shows the blocked state.
    if (res.error.code === "PROJECT_REQUIRED") { toast.show("Publish a project first to send proposals", { variant: "error" }); void load(); return; }
    if (res.error.code === "OFFLINE") { toast.show("You're offline"); return; }
    toast.show("Couldn't send that proposal");
  }, [consent, requirementId, mode, picked, offers, contactPref, number, whenToken, preferredDate, toast, onSent, onClose, load]);

  const balance = data?.balance;
  const exhausted = balance ? !balance.unlimited && balance.left <= 0 : false;
  const posts: { kind: "listing" | "project"; post: Post }[] = [
    ...(data?.listings ?? []).map((p) => ({ kind: "listing" as const, post: p })),
    ...(data?.projects ?? []).map((p) => ({ kind: "project" as const, post: p })),
  ];

  const canContinue =
    step === 0 ? data?.canPropose !== false && !data?.alreadySent
    : step === 1 ? (mode === "listing" ? Boolean(picked) : offers.length > 0)
    : step === 2 ? Boolean(number)
    : consent && (whenToken !== "date" || !!preferredDate);

  return (
    <>
      <BottomSheet
        // Same rule as the inquiry sheet: the number popup stacks on top, it
        // does not replace this. Top-up still takes over, because that is a
        // payment flow and not a popup.
        open={open && !topup}
        onClose={onClose}
        title="Send Proposal"
        hideHeader={step !== 0}
      >
        {!data ? (
          <div className="flex flex-col gap-3 pb-4">
            <Skeleton className="h-10 w-full rounded-8" />
            <Skeleton className="h-[72px] w-full rounded-12" />
            <Skeleton className="h-[72px] w-full rounded-12" />
          </div>
        ) : (
          <div className="flex flex-col pb-2">
            {/* ---- step 0 · the two ways to answer, quota above them ---- */}
            {step === 0 && (
              <>
                <div className="flex items-center gap-2 rounded-8 border border-divider bg-surface-2 px-2.5 py-2 text-12 text-ink-secondary">
                  <Icon name="check-circle" size={14} className="shrink-0 text-accent" />
                  <span className="flex-1">
                    {balance?.unlimited ? (
                      "Unlimited proposals"
                    ) : (
                      <>
                        <b className="font-semibold text-ink-primary">{balance?.left} of {balance?.total}</b> proposals left this month
                      </>
                    )}
                  </span>
                  {!balance?.unlimited && (balance?.total ?? 0) > 0 && (
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${Math.round(((balance?.left ?? 0) / (balance?.total || 1)) * 100)}%` }}
                      />
                    </span>
                  )}
                </div>

                {data.alreadySent && (
                  <p className="mt-3 rounded-8 bg-surface-2 px-3 py-2.5 text-12 text-ink-secondary">
                    You&apos;ve already answered this requirement — it&apos;s in your Sent leads.
                  </p>
                )}
                {!data.canPropose && (
                  <p className="mt-3 rounded-8 border border-warning/30 bg-warning-soft px-3 py-2.5 text-12 text-warning">
                    Publish a project first — builders answer requirements through a live project.
                  </p>
                )}
                {exhausted && (
                  <p className="mt-3 rounded-8 border border-warning/30 bg-warning-soft px-3 py-2.5 text-12 text-warning">
                    You&apos;ve used all your proposals this month. Top up to send more.
                  </p>
                )}

                <div className="mt-3 flex flex-col gap-2">
                  <OptionCard
                    icon="home"
                    title="I Have a Property"
                    subtitle={posts.length ? "Offer one of your live listings or projects" : "You have no live posts to offer yet"}
                    selected={mode === "listing"}
                    disabled={data.alreadySent || !posts.length}
                    onClick={() => setMode("listing")}
                  />
                  <OptionCard
                    icon="heart"
                    title="I Can Arrange It"
                    subtitle="No listing yet — offer to find or arrange it"
                    selected={mode === "help"}
                    disabled={data.alreadySent}
                    onClick={() => setMode("help")}
                  />
                </div>

                <Button
                  className="mt-3"
                  fullWidth
                  disabled={!canContinue}
                  onClick={() => (exhausted ? setTopup(true) : setStep(1))}
                >
                  {exhausted ? "Top up proposals" : "Continue"}
                </Button>
              </>
            )}

            {/* ---- step 1 · what you are offering ---- */}
            {step === 1 && (
              <>
                <StepHead
                  n={1}
                  title={mode === "listing" ? "Which one do you want to offer?" : "What can you offer?"}
                  right={mode === "listing" && posts.length ? `${posts.length} live` : undefined}
                  onBack={() => setStep(0)}
                />
                {mode === "listing" ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-12 text-ink-secondary">You can choose which property or project you want to offer.</p>
                    {posts.map(({ kind, post }) => (
                      <button
                        key={`${kind}:${post.id}`}
                        type="button"
                        onClick={() => setPicked({ kind, id: post.id })}
                        className={cn(
                          "chrome flex items-center gap-2.5 rounded-12 border p-2.5 text-left",
                          picked?.id === post.id ? "border-accent bg-accent-soft" : "border-border bg-surface-1",
                        )}
                      >
                        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-8 bg-surface-3">
                          {post.coverUrl && <Img src={post.coverUrl} alt="" className="h-full w-full object-cover" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-13 font-semibold text-ink-primary">{post.title ?? "Untitled"}</span>
                          <span className="block truncate text-12 text-ink-secondary">
                            {[post.priceLabel, post.areaLabel].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                            picked?.id === post.id ? "border-accent bg-accent text-white" : "border-border",
                          )}
                        >
                          {picked?.id === post.id && <Icon name="check" size={12} />}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.offers.map((o) => (
                      <Chip
                        key={o.code}
                        selected={offers.includes(o.code)}
                        onClick={() => setOffers((c) => (c.includes(o.code) ? c.filter((x) => x !== o.code) : [...c, o.code]))}
                      >
                        {o.label}
                      </Chip>
                    ))}
                  </div>
                )}
                <Note tone="accent" icon="check">
                  Your offer and preferences are shared with them automatically.
                </Note>
                <Button className="mt-3" fullWidth disabled={!canContinue} onClick={() => setStep(2)}>Continue</Button>
                <Dots step={1} />
              </>
            )}

            {/* ---- step 2 · how to be contacted ---- */}
            {step === 2 && (
              <>
                <StepHead n={2} title="How should they contact you?" onBack={() => setStep(1)} />
                <div className="mt-3 flex flex-col gap-2">
                  <PickRow icon="phone" title="Call me" subtitle={number ?? "No number on your account"} selected={contactPref === "call"} onClick={() => setContactPref("call")} />
                  <PickRow icon="whatsapp" title="WhatsApp me" subtitle={number ?? "No number on your account"} selected={contactPref === "whatsapp"} onClick={() => setContactPref("whatsapp")} />
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-12 text-ink-secondary">Not this number?</span>
                    <button type="button" onClick={() => setVerifyOpen(true)} className="chrome text-12 font-semibold text-accent">
                      Use a different number
                    </button>
                  </div>
                </div>
                <Note icon="lock">
                  {mode === "listing"
                    ? "Your property details and contact information will be shared with the requirement owner."
                    : "Your contact details will only be shared with the person who posted this requirement."}
                </Note>
                <Note icon="phone">They may contact you using your selected contact method.</Note>
                <Button className="mt-3" fullWidth disabled={!canContinue} onClick={() => setStep(3)}>Continue</Button>
                <Dots step={2} />
              </>
            )}

            {/* ---- step 3 · when + consent + send ---- */}
            {step === 3 && (
              <>
                <StepHead n={3} title="When should they contact you?" onBack={() => setStep(2)} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.when.map((o) => (
                    <Chip key={o.code} selected={whenToken === o.code} onClick={() => setWhenToken(o.code)}>{o.label}</Chip>
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
                <Note icon="clock">Your preferred contact time will be shared with them.</Note>
                <button
                  type="button"
                  onClick={() => setConsent((c) => !c)}
                  aria-pressed={consent}
                  className="chrome mt-3 flex items-start gap-2.5 text-left"
                >
                  <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border", consent ? "border-accent bg-accent text-white" : "border-border bg-surface-1")}>
                    {consent && <Icon name="check" size={13} />}
                  </span>
                  <span className="text-13 leading-snug text-ink-primary">{data.consentText}</span>
                </button>
                <Button className="mt-3" fullWidth disabled={!canContinue} loading={sending} onClick={() => void doSend()}>
                  <Icon name="send" size={16} />Send Proposal
                </Button>
                {!balance?.unlimited && (
                  <p className="mt-2 text-center text-11 text-ink-tertiary">
                    {Math.max(0, (balance?.left ?? 1) - 1)} of {balance?.total} proposals will be left
                  </p>
                )}
                <Dots step={3} />
              </>
            )}
          </div>
        )}
      </BottomSheet>

      <TopupSheet open={topup} onClose={() => { setTopup(false); void load(); }} onDone={() => { setTopup(false); void load(); }} />

      <NumberVerifySheet open={verifyOpen} onClose={() => setVerifyOpen(false)} onVerified={(n) => { setNumber(n); setVerifyOpen(false); }} />
    </>
  );
}

function StepHead({ n, title, right, onBack }: { n: number; title: string; right?: string; onBack: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <div className="text-11 font-bold uppercase tracking-wide text-accent">Step {n} of 3</div>
        <h2 className="mt-1 text-15 font-semibold text-ink-primary">{title}</h2>
      </div>
      {right ? <span className="pt-4 text-12 text-ink-tertiary">{right}</span> : null}
      <button type="button" onClick={onBack} className="chrome pt-4 text-12 font-semibold text-ink-secondary">Back</button>
    </div>
  );
}

function Dots({ step }: { step: number }) {
  return (
    <div className="mt-3.5 flex justify-center gap-1.5">
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-4 bg-accent" : "w-1.5 bg-border")} />
      ))}
    </div>
  );
}

function OptionCard({
  icon, title, subtitle, selected, disabled, onClick,
}: { icon: "home" | "heart"; title: string; subtitle: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "chrome flex items-center gap-2.5 rounded-12 border p-3 text-left disabled:opacity-50",
        selected ? "border-accent bg-accent-soft" : "border-border bg-surface-1",
      )}
    >
      <Icon name={icon} size={20} className={selected ? "text-accent" : "text-ink-secondary"} />
      <span className="min-w-0 flex-1">
        <span className="block text-14 font-semibold text-ink-primary">{title}</span>
        <span className="block text-12 text-ink-secondary">{subtitle}</span>
      </span>
      <Icon name="chevron-right" size={16} className="shrink-0 text-ink-tertiary" />
    </button>
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
      className={cn("chrome flex items-center gap-2.5 rounded-12 border p-3 text-left", selected ? "border-accent bg-accent-soft" : "border-border bg-surface-1")}
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
}: { children: React.ReactNode; icon: "lock" | "phone" | "clock" | "check"; tone?: "muted" | "accent" }) {
  return (
    <p
      className={cn(
        "mt-2.5 flex items-start gap-2 rounded-8 border p-2.5 text-12 leading-snug",
        tone === "accent" ? "border-accent/25 bg-accent-soft text-accent" : "border-divider bg-surface-2 text-ink-secondary",
      )}
    >
      <Icon name={icon} size={14} className="mt-0.5 shrink-0 opacity-80" />
      <span>{children}</span>
    </p>
  );
}

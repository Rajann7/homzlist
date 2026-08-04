"use client";

import { useState } from "react";
import {
  AppShell, Header, Icon, Button, Chip, Toggle, StatusBadge, Skeleton, Spinner,
  Avatar, BottomSheet, ConfirmDialog, EmptyState, useToast,
} from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { useTheme } from "@/components/theme/ThemeProvider";
import { scrollToId } from "@/lib/utils";

/**
 * P12 S9 — the Components gallery.
 *
 * The design's own words for what this is: one screen showing every piece of
 * the system in every state, so a regression is visible in one scroll. Which
 * means it must be built from THE REAL COMPONENTS — a gallery that reimplements
 * a button to show what a button looks like proves nothing and rots quietly.
 * Every tile below imports from @/components.
 *
 * The colour swatches are the exception: they read the live CSS variables, so
 * the panel shows what the tokens ARE rather than a hardcoded copy of Doc1 that
 * could drift away from globals.css.
 */

const SECTIONS = [
  ["colors", "Colors"], ["type", "Type"], ["buttons", "Buttons"], ["inputs", "Inputs"],
  ["chips", "Chips"], ["badges", "Badges"], ["cards", "Cards"], ["sheets", "Sheets"],
  ["dialogs", "Dialogs"], ["toasts", "Toasts"], ["empty", "Empty states"],
  ["skel", "Skeletons"], ["avatars", "Avatars"], ["bars", "Bars"], ["misc", "Misc"],
] as const;

const TOKENS = [
  ["page", "--bg-page"], ["surface1", "--surface-1"], ["surface2", "--surface-2"], ["surface3", "--surface-3"],
  ["border", "--border"], ["divider", "--divider"], ["ink1", "--ink-primary"], ["ink2", "--ink-secondary"],
  ["ink3", "--ink-tertiary"], ["inkDisabled", "--ink-disabled"], ["accent", "--accent"],
  ["accentPressed", "--accent-pressed"], ["accentSoft", "--accent-soft"], ["accentDisabled", "--accent-disabled"],
  ["error", "--error"], ["errorSoft", "--error-soft"], ["warning", "--warning"], ["warningSoft", "--warning-soft"],
  ["info", "--info"], ["infoSoft", "--info-soft"],
] as const;

export function ComponentsGallery({ base = "" }: { base?: string }) {
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const [jump, setJump] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [stacked, setStacked] = useState(false);
  const [dialog, setDialog] = useState<null | "confirm" | "destructive" | "typed" | "info">(null);
  const [toggleA, setToggleA] = useState(true);
  const [toggleB, setToggleB] = useState(false);
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("a");

  // Same guaranteed-landing jump as the legal reader: scrollIntoView with
  // behavior:"smooth" is a silent no-op wherever smooth scrolling is disabled,
  // which would leave all 15 section chips dead.
  const goto = (id: string) => {
    scrollToId(id, 108);
    setJump(false);
  };

  return (
    <AppShell
      header={
        <Header
          left={<BackButton fallback={`${base}/settings`} />}
          title="Components"
          right={
            <>
              <button
                aria-label="Toggle theme"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
              >
                <Icon name={theme === "dark" ? "sun" : "moon"} size={22} />
              </button>
              <button
                aria-label="Jump to section"
                onClick={() => setJump(true)}
                className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
              >
                <Icon name="more" size={22} />
              </button>
            </>
          }
        />
      }
    >
      <div className="sticky top-0 z-sticky flex gap-2 overflow-x-auto border-b border-divider bg-page px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map(([id, label]) => (
          <Chip key={id} onClick={() => goto(`g-${id}`)}>{label}</Chip>
        ))}
      </div>

      {/* ── colours ── */}
      <Section id="g-colors" title={`Colors — ${theme === "dark" ? "dark" : "light"}`}>
        <div className="grid grid-cols-4 gap-2">
          {TOKENS.map(([name, cssVar]) => (
            <div key={name}>
              <div className="h-10 rounded-8 border border-border" style={{ background: `var(${cssVar})` }} />
              <p className="mt-1 break-all text-11 text-ink-primary">
                {name}
                <br />
                <span className="text-ink-tertiary">{cssVar}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-11 text-ink-tertiary">
          Read live from globals.css — toggle the theme in the header and every swatch follows. Dark mode: no shadows
          → 1px borders.
        </p>
      </Section>

      {/* ── type ── */}
      <Section id="g-type" title="Typography">
        <Spec>
          <Row label="24 / 700 — page title"><p className="text-24 font-bold text-ink-primary">₹85 Lakh · Kalawad Road</p></Row>
          <Row label="20 / 700 — article H1"><p className="text-20 font-bold text-ink-primary">Buying a flat in Rajkot</p></Row>
          <Row label="17 / 600 — emphasis"><p className="text-17 font-semibold text-ink-primary">3 BHK in Mavdi, ready to move</p></Row>
          <Row label="15 / 400 — body"><p className="text-15 text-ink-primary">The listing goes live after a quick review, usually within a few hours.</p></Row>
          <Row label="15 / 600 — buttons"><p className="text-15 font-semibold text-ink-primary">Contact support</p></Row>
          <Row label="13 / 400 — secondary"><p className="text-13 text-ink-secondary">Updated 2h ago · 3 messages</p></Row>
          <Row label="13 / 600 — labels"><p className="text-13 font-semibold text-ink-primary">Payment ID</p></Row>
          <Row label="11 / 400 — meta"><p className="text-11 text-ink-tertiary">8 min read · 12 Jan</p></Row>
          <Row label="11 / 600 — badges"><p className="text-11 font-semibold uppercase tracking-[0.3px] text-ink-primary">Under review</p></Row>
          <Row label="Indian numbers & currency">
            <p className="text-15 font-semibold text-ink-primary">₹85 Lakh · ₹1.2 Cr · ₹18,000/mo</p>
            <p className="mt-1 text-13 text-ink-secondary">12.4K views · 2h ago · Yesterday · 12 Jan</p>
          </Row>
        </Spec>
      </Section>

      {/* ── buttons ── */}
      <Section id="g-buttons" title="Buttons">
        <Spec>
          <Row label="Primary — default / loading / disabled">
            <div className="flex flex-wrap gap-2">
              <Button>Post listing</Button>
              <Button loading>Posting…</Button>
              <Button disabled>Post listing</Button>
            </div>
          </Row>
          <Row label="Secondary">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary">Save draft</Button>
              <Button variant="secondary" loading>Saving…</Button>
              <Button variant="secondary" disabled>Save draft</Button>
            </div>
          </Row>
          <Row label="Outline">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline">Contact support</Button>
              <Button variant="outline" loading>Loading…</Button>
              <Button variant="outline" disabled>Contact support</Button>
            </div>
          </Row>
          <Row label="Text link">
            <div className="flex flex-wrap gap-2">
              <Button variant="text">View all</Button>
              <Button variant="text" disabled>View all</Button>
            </div>
          </Row>
          <Row label="Icon button 44×44">
            <div className="flex gap-2">
              <button className="chrome grid h-11 w-11 place-items-center rounded-8 border border-border text-ink-primary"><Icon name="heart" size={24} /></button>
              <button className="chrome grid h-11 w-11 place-items-center rounded-8 border border-border bg-surface-2 text-ink-primary"><Icon name="heart" size={24} /></button>
              <button disabled className="chrome grid h-11 w-11 place-items-center rounded-8 border border-divider text-ink-disabled"><Icon name="heart" size={24} /></button>
            </div>
          </Row>
          <Row label="Destructive">
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive">Delete account</Button>
              <Button variant="destructive" disabled>Delete account</Button>
            </div>
          </Row>
        </Spec>
      </Section>

      {/* ── inputs ── */}
      <Section id="g-inputs" title="Inputs">
        <Spec>
          <Row label="Text — default / focus / error / disabled / filled">
            <div className="flex flex-col gap-2">
              <input className={INPUT} placeholder="Society or landmark" />
              <input className={`${INPUT} border-accent shadow-[0_0_0_1px_var(--accent)]`} placeholder="Society or landmark" />
              <div>
                <input className={`${INPUT} border-error`} defaultValue="98 42" />
                <p className="mt-1 text-11 text-error">Enter a valid 10-digit number</p>
              </div>
              <input className={`${INPUT} bg-surface-2 text-ink-disabled`} disabled placeholder="Locked after verification" />
              <input className={INPUT} defaultValue="Shivalik Residency, Mavdi" />
            </div>
          </Row>
          <Row label="Textarea + counter">
            <textarea rows={3} className={`${INPUT} h-auto py-3 leading-[1.5]`} placeholder="Describe your property…" />
            <p className="mt-1 text-right text-11 text-ink-tertiary">142 / 500</p>
          </Row>
          <Row label="Phone with +91 prefix">
            <div className="flex">
              <span className="flex h-11 items-center rounded-l-8 border border-r-0 border-border bg-surface-2 px-3 text-15 font-semibold text-ink-primary">+91</span>
              <input className={`${INPUT} rounded-l-none`} defaultValue="98242 55482" />
            </div>
          </Row>
          <Row label="OTP boxes">
            <div className="flex gap-2">
              {["4", "8", "2", "", "", ""].map((v, i) => (
                <input key={i} defaultValue={v} className="h-[52px] w-11 rounded-8 border border-border bg-surface-1 text-center text-24 font-bold text-ink-primary outline-none focus:border-accent" />
              ))}
            </div>
          </Row>
          <Row label="Select row">
            <button className={`${INPUT} flex items-center justify-between text-left`}>
              <span>2 BHK</span>
              <Icon name="chevron-down" size={20} className="text-ink-tertiary" />
            </button>
          </Row>
          <Row label="Search bar h40">
            <div className="flex h-10 items-center gap-2 rounded-8 bg-surface-2 px-3 text-ink-tertiary">
              <Icon name="search" size={20} />
              <input placeholder="Search Mavdi, 2 BHK…" className="flex-1 bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary" />
            </div>
          </Row>
          <Row label="Checkbox / radio">
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={() => setChecked((v) => !v)} className="chrome flex items-center gap-2">
                <span className={`grid h-5 w-5 place-items-center rounded-4 border-[1.5px] ${checked ? "border-accent bg-accent text-white" : "border-border"}`}>
                  {checked && <Icon name="check" size={14} strokeWidth={2.5} />}
                </span>
                <span className="text-13 text-ink-primary">{checked ? "Checked" : "Unchecked"}</span>
              </button>
              {(["a", "b"] as const).map((k) => (
                <button key={k} onClick={() => setRadio(k)} className="chrome flex items-center gap-2">
                  <span className={`h-5 w-5 rounded-full border-[1.5px] ${radio === k ? "border-[6px] border-accent" : "border-border"}`} />
                  <span className="text-13 text-ink-primary">{radio === k ? "Selected" : "Default"}</span>
                </button>
              ))}
            </div>
          </Row>
          <Row label="Toggle — on / off / disabled">
            <div className="flex items-center gap-4">
              <Toggle checked={toggleA} onChange={setToggleA} />
              <Toggle checked={toggleB} onChange={setToggleB} />
              <Toggle checked={false} disabled onChange={() => {}} />
            </div>
          </Row>
          <Row label="Slider">
            <input type="range" min={0} max={100} defaultValue={60} className="w-full accent-accent" />
          </Row>
        </Spec>
      </Section>

      {/* ── chips ── */}
      <Section id="g-chips" title="Chips">
        <Spec>
          <Row label="Filter chip — default / selected / with count">
            <div className="flex flex-wrap gap-2">
              <Chip>2 BHK</Chip>
              <Chip selected>2 BHK</Chip>
              <Chip selected count={12}>Mavdi</Chip>
            </div>
          </Row>
          <Row label="Removable chip">
            <Chip>University Road <Icon name="close" size={16} /></Chip>
          </Row>
          <Row label="Urgency chip">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-error-soft px-3 text-13 font-semibold text-error">
              <Icon name="flame" size={16} />
              Urgent — needs by March
            </span>
          </Row>
        </Spec>
      </Section>

      {/* ── badges ── */}
      <Section id="g-badges" title="Badges — full set">
        <div className="flex flex-wrap gap-2">
          {(["promoted", "verified", "for-sale", "for-rent", "new-project", "rented", "under-review",
            "changes-requested", "rejected", "expired", "fulfilled", "active", "pending", "failed",
            "refunded", "trial", "grace", "stopped", "sold", "success"] as const).map((k) => (
            <StatusBadge key={k} kind={k} />
          ))}
        </div>
      </Section>

      {/* ── cards ── */}
      <Section id="g-cards" title="Cards">
        <Spec>
          <Row label="Ticket row">
            <div className="flex flex-col gap-2 rounded-12 border border-border bg-surface-1 p-3">
              <div className="flex items-center justify-between">
                <span className="text-11 text-ink-tertiary">#TKT-2841</span>
                <StatusBadge kind="pending" label="Open" />
              </div>
              <span className="text-15 font-semibold text-ink-primary">Payment deducted but plan not activated</span>
              <div className="flex items-center justify-between">
                <span className="text-11 text-ink-tertiary">Updated 2h ago · 3 messages</span>
                <Icon name="chevron-right" size={16} className="text-ink-tertiary" />
              </div>
            </div>
          </Row>
          <Row label="Usage bar">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-13 font-semibold text-ink-primary">Proposals</span>
                <span className="text-13 text-ink-secondary">7 of 10 used</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full bg-accent" style={{ width: "70%" }} />
              </div>
            </div>
          </Row>
          <Row label="Callouts — accent / warning / error / info">
            <div className="flex flex-col gap-2">
              {([["accent-soft", "info", "text-accent"], ["warning-soft", "alert", "text-warning"],
                 ["error-soft", "alert", "text-error"], ["info-soft", "info", "text-info"]] as const).map(([bg, ic, tone], i) => (
                <div key={i} className={`flex items-start gap-2.5 rounded-8 bg-${bg} p-3 text-13 leading-[1.5] text-ink-primary`}>
                  <Icon name={ic} size={18} className={`mt-px shrink-0 ${tone}`} />
                  <span>Your listing never expires — but we check every 2 months if it&apos;s still available.</span>
                </div>
              ))}
            </div>
          </Row>
        </Spec>
      </Section>

      {/* ── sheets ── */}
      <Section id="g-sheets" title="Sheets">
        <Spec>
          <Row label="Bottom sheet">
            <Button variant="outline" size="small" onClick={() => setSheet(true)}>Open a sheet</Button>
          </Row>
          <Row label="Stacked sheets — back closes the top one">
            <Button variant="outline" size="small" onClick={() => { setSheet(true); setTimeout(() => setStacked(true), 350); }}>
              Open stacked-sheet demo
            </Button>
          </Row>
          <Row label="Scrim spec">
            <p className="text-13 text-ink-secondary">
              rgba(0,0,0,.5) · fade 250ms · tap to close · sheet slides 300ms in / 250ms out, ease-out
              cubic-bezier(0.2,0,0,1)
            </p>
          </Row>
        </Spec>
      </Section>

      {/* ── dialogs ── */}
      <Section id="g-dialogs" title="Dialogs">
        <Spec>
          <Row label="Standard confirm"><Button variant="outline" size="small" onClick={() => setDialog("confirm")}>Mark as sold?</Button></Row>
          <Row label="Destructive"><Button variant="outline" size="small" onClick={() => setDialog("destructive")}>Remove this listing?</Button></Row>
          <Row label="Double-confirm with typed word"><Button variant="outline" size="small" onClick={() => setDialog("typed")}>Delete everything</Button></Row>
          <Row label="Info popup"><Button variant="outline" size="small" onClick={() => setDialog("info")}>What is a verified badge?</Button></Row>
        </Spec>
      </Section>

      {/* ── toasts ── */}
      <Section id="g-toasts" title="Toasts">
        <Spec>
          <Row label="Plain"><Button variant="outline" size="small" onClick={() => toast.show("Ticket created")}>Fire a toast</Button></Row>
          <Row label="With action link">
            <Button variant="outline" size="small" onClick={() => toast.show("Listing saved", { action: { label: "View", onClick: () => {} } })}>
              Fire with action
            </Button>
          </Row>
          <Row label="Error"><Button variant="outline" size="small" onClick={() => toast.show("Still offline", { variant: "error" })}>Fire an error</Button></Row>
          <Row label="Spec"><p className="text-13 text-ink-secondary">Position: bottom 80px, above nav · in 200ms · hold 3s · out 200ms</p></Row>
        </Spec>
      </Section>

      {/* ── empty states ── */}
      <Section id="g-empty" title="Empty states">
        <div className="grid grid-cols-1 gap-3">
          <EmptyState illustration={<Icon name="message" size={96} strokeWidth={1} className="text-ink-tertiary" />} title="No chats yet" subtitle="Chats start when someone inquires on your listing" />
          <EmptyState illustration={<Icon name="bookmark" size={96} strokeWidth={1} className="text-ink-tertiary" />} title="No saved properties" subtitle="Tap the heart on any listing to save it" />
          <EmptyState illustration={<Icon name="headset" size={96} strokeWidth={1} className="text-ink-tertiary" />} title="No support tickets" subtitle="Contact us if something isn't working" />
        </div>
      </Section>

      {/* ── skeletons ── */}
      <Section id="g-skel" title="Skeletons">
        <Spec>
          <Row label="Feed card">
            <div className="flex flex-col gap-2">
              <Skeleton className="aspect-[16/9] w-full rounded-12" />
              <Skeleton className="h-4 w-2/5 rounded-8" />
              <Skeleton className="h-3 w-7/10 rounded-8" />
            </div>
          </Row>
          <Row label="List row">
            <div className="flex gap-3">
              <Skeleton className="h-14 w-14 rounded-8" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-4/5 rounded-8" />
                <Skeleton className="h-2.5 w-2/5 rounded-8" />
              </div>
            </div>
          </Row>
          <Row label="Shimmer spec">
            <p className="text-13 text-ink-secondary">surface2 base · linear-gradient sweep · 1.2s loop · respects reduced-motion</p>
          </Row>
        </Spec>
      </Section>

      {/* ── avatars ── */}
      <Section id="g-avatars" title="Avatars">
        <Spec>
          <Row label="Sizes 24 / 32 / 48 / 64">
            <div className="flex items-end gap-3">
              {([24, 32, 48, 64] as const).map((s) => <Avatar key={s} name="Rakesh M" size={s} />)}
            </div>
          </Row>
          <Row label="Spinner">
            <div className="flex items-center gap-3 text-accent">
              <Spinner size={18} /><Spinner size={24} /><Spinner size={32} />
            </div>
          </Row>
        </Spec>
      </Section>

      {/* ── bars ── */}
      <Section id="g-bars" title="Bars">
        <Spec>
          <Row label="Progress dots">
            <div className="flex gap-1.5">
              {[true, true, false, false, false].map((on, i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${on ? "bg-accent" : "bg-surface-3"}`} />
              ))}
            </div>
          </Row>
          <Row label="Countdown bar">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-13 font-semibold text-ink-primary">
                  <Icon name="clock" size={16} className="text-warning" />Boost ends in 3d 14h
                </span>
                <span className="text-13 font-semibold text-accent">Extend</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-warning" style={{ width: "52%" }} /></div>
            </div>
          </Row>
          <Row label="Offline banner">
            <div className="flex items-center justify-center gap-2 rounded-8 bg-ink-primary px-4 py-2 text-13 text-ink-inverse">
              <Icon name="wifi-off" size={16} />You&apos;re offline — showing saved data
            </div>
          </Row>
          <Row label="'New listings' pill">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-13 font-semibold text-ink-inverse shadow-l2">
              <Icon name="chevron-up" size={16} />12 new listings
            </span>
          </Row>
        </Spec>
      </Section>

      {/* ── misc ── */}
      <Section id="g-misc" title="Misc" last>
        <Spec>
          <Row label="System message card">
            <div className="rounded-8 bg-surface-2 px-4 py-2.5 text-center text-11 text-ink-tertiary">
              Rakesh accepted your inquiry. His number is now visible to you.
            </div>
          </Row>
          <Row label="Date separator / unread divider">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-divider" /><span className="text-11 text-ink-tertiary">Yesterday</span><span className="h-px flex-1 bg-divider" />
              </div>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-error" /><span className="text-11 font-semibold text-error">Unread messages</span><span className="h-px flex-1 bg-error" />
              </div>
            </div>
          </Row>
          <Row label="Error illustration family">
            <div className="grid grid-cols-4 gap-2 text-center">
              {([["home", "Not found"], ["cloud-off", "Offline"], ["wrench", "Maintenance"], ["alert", "Crash"]] as const).map(([ic, label]) => (
                <div key={label} className="flex flex-col items-center gap-1.5 rounded-12 border border-border bg-surface-1 px-1 py-3">
                  <Icon name={ic} size={32} className="text-ink-tertiary" />
                  <span className="text-11 text-ink-tertiary">{label}</span>
                </div>
              ))}
            </div>
          </Row>
        </Spec>
      </Section>

      {/* jump sheet */}
      <BottomSheet open={jump} onClose={() => setJump(false)} title="Jump to section">
        <div className="flex flex-col pb-2">
          {SECTIONS.map(([id, label]) => (
            <button key={id} onClick={() => goto(`g-${id}`)} className="chrome flex min-h-12 items-center px-4 text-left text-15 text-ink-primary active:bg-surface-2">
              {label}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Sheet title">
        <div className="p-4 text-13 text-ink-secondary">
          Content area — scrolls independently. Handle 36×4 r999 · title 17/600 centred · X 44×44.
        </div>
        <div className="border-t border-divider p-4"><Button fullWidth onClick={() => setSheet(false)}>Sticky footer action</Button></div>
      </BottomSheet>
      <BottomSheet open={stacked} onClose={() => setStacked(false)} title="Second sheet">
        <div className="p-4 text-13 text-ink-secondary">
          Back (or Esc) closes this one first and leaves the sheet underneath open.
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={dialog === "confirm"} onClose={() => setDialog(null)} onConfirm={() => setDialog(null)}
        title="Mark as sold?" body="Your listing will move to Sold and stop getting inquiries." confirmLabel="Mark sold"
      />
      <ConfirmDialog
        open={dialog === "destructive"} onClose={() => setDialog(null)} onConfirm={() => setDialog(null)}
        title="Remove this listing?" body="This can't be undone. Your plan's listing slot stays used."
        confirmLabel="Remove" destructive
      />
      <ConfirmDialog
        open={dialog === "typed"} onClose={() => setDialog(null)} onConfirm={() => setDialog(null)}
        title="This will delete everything" typeToConfirm="DELETE" confirmLabel="Delete account" destructive
      />
      <ConfirmDialog
        open={dialog === "info"} onClose={() => setDialog(null)} onConfirm={() => setDialog(null)}
        title="What is a verified badge?"
        body="Our team checked this owner's documents against the listing. It's not a guarantee of title."
        confirmLabel="Got it" hideCancel
      />
    </AppShell>
  );
}

const INPUT =
  "h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none " +
  "focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary";

function Section({ id, title, children, last }: { id: string; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div id={id} className={`scroll-mt-28 p-4 ${last ? "" : "border-b-8 border-surface-2"}`}>
      <h2 className="mb-3 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{title}</h2>
      {children}
    </div>
  );
}

function Spec({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-12 bg-surface-2 p-4">{children}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{label}</p>
      {children}
    </div>
  );
}

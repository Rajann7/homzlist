"use client";

import { useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { Header } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "@/components/theme/ThemeProvider";
import { List, Row, P12Chip } from "@/components/help/primitives";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/**
 * P12 S9 — the components gallery.
 *
 * A design-system reference surface, not a product screen: it renders every
 * token, control and card shape the app is built from so the system can be
 * eyeballed at both breakpoints and in both themes. The values here ARE the
 * design (Doc1 §1), which is why the colour swatches carry literal hex — this is
 * the one place in the codebase where that is the content rather than a shortcut.
 */
const SECTIONS: Array<{ id: string; label: string }> = [
  { id: "g-colors", label: "Colors" },
  { id: "g-type", label: "Type" },
  { id: "g-buttons", label: "Buttons" },
  { id: "g-inputs", label: "Inputs" },
  { id: "g-chips", label: "Chips" },
  { id: "g-badges", label: "Badges" },
  { id: "g-cards", label: "Cards" },
  { id: "g-sheets", label: "Sheets" },
  { id: "g-dialogs", label: "Dialogs" },
  { id: "g-toasts", label: "Toasts" },
  { id: "g-empty", label: "Empty states" },
  { id: "g-skel", label: "Skeletons" },
  { id: "g-avatars", label: "Avatars" },
  { id: "g-bars", label: "Bars" },
  { id: "g-misc", label: "Misc" },
];

const LIGHT: Array<[string, string]> = [
  ["page", "#FFFFFF"], ["surface1", "#FFFFFF"], ["surface2", "#F5F5F5"], ["surface3", "#EFEFEF"],
  ["border", "#DBDBDB"], ["divider", "#EFEFEF"], ["ink1", "#111111"], ["ink2", "#555555"],
  ["ink3", "#8E8E8E"], ["inkDisabled", "#C7C7C7"], ["accent", "#0F9D58"], ["accentPressed", "#0C7C46"],
  ["accentSoft", "#E6F4EC"], ["accentDisabled", "#A8D5BD"], ["error", "#ED4956"], ["errorSoft", "#FDECEE"],
  ["warning", "#F5A623"], ["warningSoft", "#FEF5E7"], ["info", "#0095F6"], ["infoSoft", "#E7F3FD"],
];
const DARK: Array<[string, string]> = [
  ["page", "#000000"], ["surface1", "#121212"], ["surface2", "#1E1E1E"], ["surface3", "#262626"],
  ["border", "#363636"], ["divider", "#262626"], ["ink1", "#F5F5F5"], ["ink2", "#B0B0B0"],
  ["ink3", "#8E8E8E"], ["inkDisabled", "#4D4D4D"], ["accent", "#1DB868"], ["accentPressed", "#17A05A"],
  ["accentSoft", "#0E2B1C"], ["error", "#FF5C6A"], ["warning", "#FFB74D"], ["info", "#3BA7F8"],
];

const EMPTIES: Array<[IconName, string, string, string]> = [
  ["message", "No chats yet", "Chats start when someone inquires on your listing", "Browse listings"],
  ["message", "No buying chats", "Inquire on a property to start one", "Explore Rajkot"],
  ["message", "No selling chats", "Buyers will appear here when they inquire", "Boost listing"],
  ["check", "All caught up", "No unread messages", "View all chats"],
  ["building", "No listings", "Post your property in under 5 minutes", "Post listing"],
  ["bookmark", "No saved properties", "Tap the heart on any listing to save it", "Start browsing"],
  ["search", "No requirements", "Tell owners what you're looking for", "Post requirement"],
  ["filter", "No results", "Try widening your budget or area", "Clear filters"],
  ["bell", "No notifications", "We'll nudge you when something happens", "Notification settings"],
  ["calendar", "No visits", "Scheduled site visits show up here", "Browse listings"],
  ["send", "No proposals", "Send your listing to matching requirements", "See requirements"],
  ["file", "No drafts", "Half-finished listings are saved here", "Start a listing"],
  ["pin", "New here?", "Be the first to list in your area of Rajkot", "Post the first listing"],
  ["user", "No leads yet", "Boost your listing to reach more buyers", "Boost now"],
  ["trash", "Trash is empty", "Deleted listings stay here for 30 days", "Back to listings"],
  ["ban", "No blocked users", "People you block will appear here", "Privacy settings"],
  ["card", "No payments", "Your invoices and receipts will live here", "See plans"],
];

export function ComponentsGallery() {
  const toast = useToast();
  const { resolved, toggle } = useTheme();
  const [jump, setJump] = useState(false);
  const [tgl, setTgl] = useState([true, false]);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setJump(false);
  };

  return (
    <AppShell
      showNav={false}
      header={
        <Header
          left={<BackButton fallback="/" />}
          title="Components"
          right={
            <>
              <button
                type="button"
                onClick={toggle}
                aria-label="Toggle theme"
                className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
              >
                <Icon name={resolved === "dark" ? "sun" : "moon"} size={24} />
              </button>
              <button
                type="button"
                onClick={() => setJump(true)}
                aria-label="Jump to section"
                className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
              >
                <Icon name="more" size={24} />
              </button>
            </>
          }
        />
      }
    >
      <div className="no-scrollbar sticky top-0 z-sticky flex gap-2 overflow-x-auto border-b border-divider bg-page px-4 py-2">
        {SECTIONS.map((s) => (
          <P12Chip key={s.id} onClick={() => go(s.id)}>
            {s.label}
          </P12Chip>
        ))}
      </div>

      {/* ------------------------------------------------------------ colors */}
      <Sec id="g-colors" title="Colors — light">
        <div className="grid grid-cols-4 gap-2">
          {LIGHT.map(([name, hex]) => (
            <Swatch key={name} name={name} hex={hex} />
          ))}
        </div>
        <h3 className="mb-3 mt-5 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Colors — dark</h3>
        <div className="grid grid-cols-4 gap-2 rounded-12 bg-black p-3">
          {DARK.map(([name, hex]) => (
            <Swatch key={name} name={name} hex={hex} dark />
          ))}
        </div>
        <p className="mt-2 text-11 text-ink-tertiary">Dark mode: no shadows → 1px borders.</p>
      </Sec>

      {/* -------------------------------------------------------------- type */}
      <Sec id="g-type" title="Typography">
        <Spec>
          <Item label="24 / 700 — page title"><p className="text-24 font-bold">₹85 Lakh · Kalawad Road</p></Item>
          <Item label="20 / 700 — article H1"><p className="text-20 font-bold">Buying a flat in Rajkot</p></Item>
          <Item label="17 / 600 — emphasis / headers"><p className="text-17 font-semibold">3 BHK in Mavdi, ready to move</p></Item>
          <Item label="15 / 400 — body"><p className="text-15">The listing goes live after a quick review, usually within a few hours.</p></Item>
          <Item label="15 / 600 — buttons"><p className="text-15 font-semibold">Contact support</p></Item>
          <Item label="13 / 400 — secondary"><p className="text-13 text-ink-secondary">Updated 2h ago · 3 messages</p></Item>
          <Item label="13 / 600 — labels"><p className="text-13 font-semibold">Payment ID</p></Item>
          <Item label="11 / 400 — meta"><p className="text-11 text-ink-tertiary">8 min read · 12 Jan</p></Item>
          <Item label="11 / 600 — badges, uppercase +0.3px">
            <p className="text-11 font-semibold uppercase tracking-[0.3px]">Under review</p>
          </Item>
          <Item label="Indian numbers & currency">
            <p className="text-15 font-semibold">₹85 Lakh · ₹1.2 Cr · ₹18,000/mo</p>
            <p className="mt-1 text-13 text-ink-secondary">12.4K views · 2h ago · Yesterday · 12 Jan</p>
          </Item>
        </Spec>
      </Sec>

      {/* ----------------------------------------------------------- buttons */}
      <Sec id="g-buttons" title="Buttons">
        <Spec>
          <Item label="Primary — default / pressed / loading / disabled">
            <Wrap>
              <Btn>Post listing</Btn>
              <Btn className="scale-[0.98] bg-accent-pressed">Post listing</Btn>
              <Btn><Spin />Posting…</Btn>
              <Btn disabled>Post listing</Btn>
            </Wrap>
          </Item>
          <Item label="Secondary">
            <Wrap>
              <Btn kind="sec">Save draft</Btn>
              <Btn kind="sec" className="scale-[0.98] bg-surface-3">Save draft</Btn>
              <Btn kind="sec"><Spin dark />Saving…</Btn>
              <Btn kind="sec" className="text-ink-disabled">Save draft</Btn>
            </Wrap>
          </Item>
          <Item label="Outline">
            <Wrap>
              <Btn kind="out">Contact support</Btn>
              <Btn kind="out" className="scale-[0.98] bg-surface-2">Contact support</Btn>
              <Btn kind="out"><Spin dark />Loading…</Btn>
              <Btn kind="out" className="border-divider text-ink-disabled">Contact support</Btn>
            </Wrap>
          </Item>
          <Item label="Text link">
            <Wrap>
              <Btn kind="txt">View all</Btn>
              <Btn kind="txt" className="scale-[0.98] text-accent-pressed">View all</Btn>
              <Btn kind="txt" className="text-accent-disabled">View all</Btn>
            </Wrap>
          </Item>
          <Item label="Icon button 44×44">
            <Wrap>
              <IconBtn />
              <IconBtn className="scale-[0.98] bg-surface-2" />
              <IconBtn className="border-divider text-ink-disabled" />
            </Wrap>
          </Item>
          <Item label="Destructive">
            <Wrap>
              <Btn kind="err">Delete account</Btn>
              <Btn kind="erro">Delete account</Btn>
              <Btn kind="err" disabled>Delete account</Btn>
            </Wrap>
          </Item>
        </Spec>
      </Sec>

      {/* ------------------------------------------------------------ inputs */}
      <Sec id="g-inputs" title="Inputs">
        <Spec>
          <Item label="Text — default / focus / error / disabled / filled">
            <div className="flex flex-col gap-2">
              <Inp placeholder="Society or landmark" />
              <Inp placeholder="Society or landmark" className="border-accent shadow-[0_0_0_1px_var(--accent)]" />
              <div>
                <Inp defaultValue="98 42" className="border-error" />
                <p className="mt-1 text-11 text-error">Enter a valid 10-digit number</p>
              </div>
              <Inp placeholder="Locked after verification" disabled className="bg-surface-2 text-ink-disabled" />
              <Inp defaultValue="Shivalik Residency, Mavdi" />
            </div>
          </Item>
          <Item label="Textarea + counter">
            <textarea
              rows={3}
              placeholder="Describe your property…"
              className="w-full resize-none rounded-8 border border-border bg-surface-1 p-3 text-15 leading-[1.5] text-ink-primary outline-none placeholder:text-ink-tertiary"
            />
            <p className="mt-1 text-right text-11 text-ink-tertiary">142 / 500</p>
          </Item>
          <Item label="Phone with +91 prefix">
            <div className="flex">
              <span className="flex h-11 items-center rounded-l-8 border border-r-0 border-border bg-surface-2 px-3 text-15 font-semibold text-ink-primary">
                +91
              </span>
              <Inp defaultValue="98242 55482" className="rounded-l-none" />
            </div>
          </Item>
          <Item label="Price with word-line">
            <Inp defaultValue="₹85,00,000" />
            <p className="mt-1 text-11 text-accent">Eighty-five lakh rupees</p>
          </Item>
          <Item label="OTP boxes">
            <div className="flex gap-2">
              {["4", "8", "2", "", "", ""].map((v, i) => (
                <input
                  key={i}
                  defaultValue={v}
                  readOnly
                  className="h-[52px] w-11 rounded-8 border border-border bg-surface-1 text-center text-24 font-bold text-ink-primary outline-none"
                />
              ))}
            </div>
          </Item>
          <Item label="Select row">
            <button type="button" className="flex h-11 w-full items-center justify-between rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary">
              <span>2 BHK</span>
              <Icon name="chevron-down" size={20} className="text-ink-tertiary" />
            </button>
          </Item>
          <Item label="Search bar h40">
            <div className="flex h-10 items-center gap-2 rounded-8 bg-surface-2 px-3 text-ink-tertiary">
              <Icon name="search" size={20} />
              <input placeholder="Search Mavdi, 2 BHK…" className="min-w-0 flex-1 bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary" />
            </div>
          </Item>
          <Item label="Checkbox / radio">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-4 border-[1.5px] border-accent bg-accent text-white">
                  <Icon name="check" size={16} />
                </span>
                <span className="text-13">Checked</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-4 border-[1.5px] border-border" />
                <span className="text-13">Unchecked</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full border-[6px] border-accent" />
                <span className="text-13">Selected</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full border-[1.5px] border-border" />
                <span className="text-13">Default</span>
              </span>
            </div>
          </Item>
          <Item label="Toggle — on / off / disabled">
            <div className="flex items-center gap-4">
              {[0, 1].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTgl((t) => t.map((v, k) => (k === i ? !v : v)))}
                  className={cn(
                    "relative h-[26px] w-11 rounded-full transition-colors",
                    tgl[i] ? "bg-accent" : "bg-surface-3",
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow-l1 transition-transform duration-200 ease-out-quart",
                      tgl[i] && "translate-x-[18px]",
                    )}
                  />
                </button>
              ))}
              <button type="button" disabled className="relative h-[26px] w-11 rounded-full bg-surface-3 opacity-40">
                <span className="absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow-l1" />
              </button>
            </div>
          </Item>
          <Item label="Slider">
            <input type="range" min={0} max={100} defaultValue={60} className="w-full accent-accent" />
          </Item>
          <Item label="Dual-range (budget ₹30L – ₹80L)">
            <div className="relative h-6">
              <div className="absolute left-0 right-0 top-[10px] h-1 rounded-full bg-surface-3" />
              <div className="absolute left-[25%] right-[30%] top-[10px] h-1 rounded-full bg-accent" />
              <div className="absolute left-[25%] top-0.5 -ml-2.5 h-5 w-5 rounded-full border-[1.5px] border-accent bg-surface-1 shadow-l1" />
              <div className="absolute right-[30%] top-0.5 -mr-2.5 h-5 w-5 rounded-full border-[1.5px] border-accent bg-surface-1 shadow-l1" />
            </div>
            <div className="flex justify-between text-11 text-ink-secondary">
              <span>₹30 Lakh</span>
              <span>₹80 Lakh</span>
            </div>
          </Item>
        </Spec>
      </Sec>

      {/* ------------------------------------------------------------- chips */}
      <Sec id="g-chips" title="Chips">
        <Spec>
          <Item label="Filter chip — default / selected / with count">
            <Wrap>
              <P12Chip as="span">2 BHK</P12Chip>
              <P12Chip as="span" on>2 BHK</P12Chip>
              <P12Chip as="span" on>
                Mavdi <span className="rounded-full bg-accent px-1.5 py-px text-11 font-semibold text-white">12</span>
              </P12Chip>
            </Wrap>
          </Item>
          <Item label="Type chip">
            <Wrap>
              {["Flat", "Tenament", "Plot"].map((t) => (
                <P12Chip key={t} as="span" className="h-6 text-11">{t}</P12Chip>
              ))}
            </Wrap>
          </Item>
          <Item label="Removable chip">
            <P12Chip as="span">
              University Road
              <Icon name="close" size={16} className="-mr-1" />
            </P12Chip>
          </Item>
          <Item label="Urgency chip">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-error-soft px-3 text-13 font-semibold text-error">
              <Icon name="flame" size={16} />
              Urgent — needs by March
            </span>
          </Item>
        </Spec>
      </Sec>

      {/* ------------------------------------------------------------ badges */}
      <Sec id="g-badges" title="Badges — full set">
        <Spec>
          <Wrap>
            <Bdg cls="bg-accent text-white"><Icon name="zap" size={12} />Promoted</Bdg>
            <Bdg cls="bg-accent-soft text-accent"><Icon name="verified" size={12} />Verified</Bdg>
            <Bdg cls="bg-accent-soft text-accent"><Icon name="verified" size={12} />Verified owner</Bdg>
            <Bdg cls="bg-accent-soft text-accent"><Icon name="verified" size={12} />Verified + docs</Bdg>
            <Bdg cls="bg-accent-soft text-accent">For Sale</Bdg>
            <Bdg cls="bg-info-soft text-info">For Rent</Bdg>
            <Bdg cls="bg-info-soft text-info">New Project</Bdg>
            <Bdg cls="bg-surface-3 text-ink-secondary">Rented</Bdg>
            <Bdg cls="bg-warning-soft text-warning">Under Review</Bdg>
            <Bdg cls="bg-warning-soft text-warning">Changes Requested</Bdg>
            <Bdg cls="bg-error-soft text-error">Rejected</Bdg>
            <Bdg cls="bg-surface-3 text-ink-secondary">Expired</Bdg>
            <Bdg cls="bg-accent-soft text-accent">Fulfilled</Bdg>
            <Bdg cls="bg-accent-soft text-accent"><span className="h-1.5 w-1.5 rounded-full bg-current" />Active</Bdg>
            <Bdg cls="bg-warning-soft text-warning">Pending</Bdg>
            <Bdg cls="bg-error-soft text-error">Failed</Bdg>
            <Bdg cls="bg-info-soft text-info">Refunded</Bdg>
            <Bdg cls="bg-info-soft text-info">Trial</Bdg>
            <Bdg cls="bg-warning-soft text-warning">Grace</Bdg>
          </Wrap>
          <Item label="Sold — ribbon variant">
            <div className="relative flex h-[100px] w-40 items-center justify-center overflow-hidden rounded-12 bg-gradient-to-br from-[#B9CCC1] to-[#7E9C8B] text-white/75">
              <Icon name="home" size={20} />
              <span className="absolute -left-7 top-3 -rotate-[38deg] bg-error px-8 py-[3px] text-11 font-semibold uppercase tracking-[0.3px] text-white">
                Sold
              </span>
            </div>
          </Item>
        </Spec>
      </Sec>

      {/* ------------------------------------------------------------- cards */}
      <Sec id="g-cards" title="Cards">
        <Spec>
          <Item label="PropertyCard — sale">
            <Card>
              <div className="relative flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-[#B9CCC1] to-[#7E9C8B] text-white/75">
                <Icon name="home" size={48} />
                <span className="absolute left-2 top-2 inline-flex h-5 items-center gap-1 rounded-4 bg-accent px-1.5 text-11 font-semibold uppercase tracking-[0.3px] text-white">
                  <Icon name="zap" size={12} />Promoted
                </span>
                <span className="absolute right-0.5 top-0.5 grid h-11 w-11 place-items-center text-white">
                  <Icon name="heart" size={24} />
                </span>
              </div>
              <div className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-17 font-semibold">₹85 Lakh</span>
                  <Bdg cls="bg-accent-soft text-accent">For Sale</Bdg>
                </div>
                <p className="text-15 font-semibold">3 BHK flat in Shivalik Residency</p>
                <p className="flex items-center gap-1 text-13 text-ink-secondary">
                  <Icon name="pin" size={16} /> Kalawad Road, Rajkot
                </p>
                <div className="mt-1 flex gap-3 text-13 text-ink-secondary">
                  <span className="flex items-center gap-1"><Icon name="bed" size={16} />3 BHK</span>
                  <span className="flex items-center gap-1"><Icon name="maximize" size={16} />1,450 sq ft</span>
                  <span className="flex items-center gap-1"><Icon name="calendar" size={16} />Ready</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-divider pt-2">
                  <span className="flex items-center gap-1 text-11 font-semibold text-accent">
                    <Icon name="verified" size={16} />Verified owner
                  </span>
                  <span className="text-11 text-ink-tertiary">12.4K views · 2h ago</span>
                </div>
              </div>
            </Card>
          </Item>

          <Item label="PropertyCard — rent">
            <Card>
              <div className="relative flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-[#B7C3CE] to-[#71838F] text-white/75">
                <Icon name="home" size={48} />
                <span className="absolute right-0.5 top-0.5 grid h-11 w-11 place-items-center text-white">
                  <Icon name="heart" size={24} />
                </span>
              </div>
              <div className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-17 font-semibold">₹18,000/mo</span>
                  <Bdg cls="bg-info-soft text-info">For Rent</Bdg>
                </div>
                <p className="text-15 font-semibold">2 BHK semi-furnished near RK University</p>
                <p className="flex items-center gap-1 text-13 text-ink-secondary">
                  <Icon name="pin" size={16} /> University Road, Rajkot
                </p>
                <div className="mt-1 flex gap-3 text-13 text-ink-secondary">
                  <span className="flex items-center gap-1"><Icon name="bed" size={16} />2 BHK</span>
                  <span className="flex items-center gap-1"><Icon name="maximize" size={16} />1,050 sq ft</span>
                  <span className="flex items-center gap-1"><Icon name="calendar" size={16} />From 1 Feb</span>
                </div>
              </div>
            </Card>
          </Item>

          <Item label="ProjectCard">
            <Card>
              <div className="relative flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-[#C9C2B4] to-[#948A74] text-white/75">
                <Icon name="building" size={48} />
                <span className="absolute left-2 top-2">
                  <Bdg cls="bg-info-soft text-info">New Project</Bdg>
                </span>
              </div>
              <div className="flex flex-col gap-1 px-4 py-3">
                <p className="text-17 font-semibold">Sterling Heights</p>
                <p className="text-13 text-ink-secondary">2 &amp; 3 BHK · Nana Mava Circle · Possession Dec 2026</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-15 font-semibold">₹45 Lakh – ₹1.2 Cr</span>
                  <span className="text-11 text-ink-tertiary">RERA: PR/GJ/RAJKOT/2025/1182</span>
                </div>
              </div>
            </Card>
          </Item>

          <Item label="RequirementCard — unlocked">
            <Card className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center justify-between">
                <Bdg cls="bg-accent-soft text-accent"><span className="h-1.5 w-1.5 rounded-full bg-current" />Active</Bdg>
                <span className="text-11 text-ink-tertiary">Posted 3d ago · 22 days left</span>
              </div>
              <p className="text-15 font-semibold">Looking for a 2 BHK flat in Mavdi or Nana Mava</p>
              <p className="text-13 text-ink-secondary">Budget ₹40–55 Lakh · Ready to move · Family of 4</p>
              <div className="flex items-center gap-2 border-t border-divider pt-2">
                <Av size={32}>RM</Av>
                <div className="flex flex-1 flex-col">
                  <span className="text-13 font-semibold">Rakesh M.</span>
                  <span className="text-11 text-ink-tertiary">+91 98242 •••82</span>
                </div>
                <Btn className="h-9 px-3 text-13">Send proposal</Btn>
              </div>
            </Card>
          </Item>

          <Item label="LockedRequirementCard">
            <Card className="relative flex flex-col gap-2 overflow-hidden px-4 py-3">
              <div className="flex items-center justify-between">
                <Bdg cls="bg-accent-soft text-accent"><span className="h-1.5 w-1.5 rounded-full bg-current" />Active</Bdg>
                <span className="text-11 text-ink-tertiary">Posted 1d ago</span>
              </div>
              <p className="text-15 font-semibold">
                Looking for a 3 BHK in <span className="blur-[5px]">Kalawad Road</span>
              </p>
              <p className="text-13 text-ink-secondary blur-[5px]">
                Budget ₹70–90 Lakh · New scheme preferred · Contact 98242 55482
              </p>
              <div className="flex items-center gap-2 rounded-8 bg-surface-2 px-3 py-2.5">
                <Icon name="lock" size={20} className="text-ink-secondary" />
                <span className="flex-1 text-13 text-ink-secondary">Unlock details with a plan</span>
                <Btn className="h-9 px-3 text-13">View plans</Btn>
              </div>
            </Card>
          </Item>

          <Item label="ProposalCard">
            <Card className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-11 text-ink-tertiary">Sent 2 Jan · to Rakesh M.&apos;s requirement</span>
                <Bdg cls="bg-warning-soft text-warning">Pending</Bdg>
              </div>
              <div className="flex gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-8 bg-gradient-to-br from-[#B9CCC1] to-[#7E9C8B] text-white/75">
                  <Icon name="home" size={20} />
                </span>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-15 font-semibold">₹52 Lakh · 2 BHK in Mavdi</span>
                  <span className="text-13 text-ink-secondary">&quot;Ready to move, near D-Mart, society parking…&quot;</span>
                </div>
              </div>
              <p className="text-11 text-ink-tertiary">7 of 10 proposals used this month</p>
            </Card>
          </Item>

          <Item label="LeadCard">
            <Card className="flex flex-col gap-2 px-4 py-3">
              <div className="flex gap-3">
                <Av size={48}>PS</Av>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-15 font-semibold">
                    Priya S. <Bdg cls="bg-accent-soft text-accent align-[2px]"><Icon name="verified" size={12} />Verified</Bdg>
                  </span>
                  <span className="text-13 text-ink-secondary">Interested in your 3 BHK on Kalawad Road</span>
                  <span className="text-11 text-ink-tertiary">Inquired 25 min ago</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Btn className="h-9 flex-1 px-3 text-13"><Icon name="phone" size={16} className="text-white" />Call</Btn>
                <Btn kind="out" className="h-9 flex-1 px-3 text-13"><Icon name="message" size={16} />Chat</Btn>
              </div>
            </Card>
          </Item>

          <Item label="Plan card">
            <Card className="flex flex-col gap-2 border-accent p-4">
              <div className="flex items-center justify-between">
                <span className="text-17 font-semibold">Owner Plan</span>
                <Bdg cls="bg-accent-soft text-accent"><span className="h-1.5 w-1.5 rounded-full bg-current" />Active</Bdg>
              </div>
              <p className="text-24 font-bold text-accent">
                ₹999 <span className="text-13 font-normal text-ink-tertiary">one-time</span>
              </p>
              <div className="flex flex-col gap-2 text-13 text-ink-secondary">
                <span className="flex items-center gap-2"><Icon name="check" size={16} className="text-accent" />1 lifetime listing — used</span>
                <span className="flex items-center gap-2"><Icon name="check" size={16} className="text-accent" />1 requirement (30 days) — 22 days left</span>
                <span className="flex items-center gap-2"><Icon name="check" size={16} className="text-accent" />10 proposals — 7 used</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full w-[70%] bg-accent" /></div>
              <p className="text-11 text-ink-tertiary">Purchased 14 Dec 2024 · PAY-88213</p>
            </Card>
          </Item>

          <Item label="Boost card">
            <Card className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-15 font-semibold">
                  <Icon name="zap" size={20} className="text-warning" />Boost — Mavdi area
                </span>
                <Bdg cls="bg-accent-soft text-accent"><span className="h-1.5 w-1.5 rounded-full bg-current" />Active</Bdg>
              </div>
              <p className="text-13 text-ink-secondary">Your 2 BHK is showing at the top of Mavdi results</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full w-[43%] bg-warning" /></div>
              <div className="flex items-center justify-between text-11 text-ink-tertiary">
                <span>3 of 7 days used</span>
                <span>+340% views</span>
              </div>
            </Card>
          </Item>

          <Item label="Visit card">
            <Card className="flex flex-col gap-2 px-4 py-3">
              <div className="flex gap-3">
                <div className="flex h-[52px] w-12 flex-col items-center justify-center rounded-8 bg-accent-soft">
                  <span className="text-11 font-semibold uppercase tracking-[0.3px] text-accent">Jan</span>
                  <span className="text-20 font-bold text-accent">18</span>
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-15 font-semibold">Site visit · 5:30 PM</span>
                  <span className="text-13 text-ink-secondary">3 BHK, Shivalik Residency with Priya S.</span>
                </div>
                <Bdg cls="bg-info-soft text-info">Upcoming</Bdg>
              </div>
              <div className="flex gap-2">
                <Btn kind="out" className="h-9 flex-1 px-3 text-13">Reschedule</Btn>
                <Btn kind="sec" className="h-9 flex-1 px-3 text-13">Directions</Btn>
              </div>
            </Card>
          </Item>

          <Item label="Ticket row">
            <Card className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between">
                <span className="text-11 text-ink-tertiary">#TKT-2841</span>
                <Bdg cls="bg-info-soft text-info">Open</Bdg>
              </div>
              <span className="text-15 font-semibold">Payment deducted but plan not activated</span>
              <div className="flex items-center justify-between">
                <span className="text-11 text-ink-tertiary">Updated 2h ago · 3 messages</span>
                <Icon name="chevron-right" size={16} className="text-ink-tertiary" />
              </div>
            </Card>
          </Item>
        </Spec>
      </Sec>

      {/* ------------------------------------------------------------ sheets */}
      <Sec id="g-sheets" title="Sheets">
        <Spec>
          <Item label="Bottom sheet anatomy">
            <div className="overflow-hidden rounded-t-12 border border-border bg-surface-1">
              <div className="relative border-b border-divider px-4 pb-3 pt-2">
                <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-border" />
                <p className="px-11 text-center text-17 font-semibold">Sheet title</p>
                <span className="absolute right-1 top-3 grid h-11 w-11 place-items-center">
                  <Icon name="close" size={24} />
                </span>
              </div>
              <div className="p-4 text-13 text-ink-secondary">
                Content area — scrolls independently. Handle 36×4 r999 · title 17/600 centred · X 44×44.
              </div>
              <div className="border-t border-divider p-4">
                <span className="flex h-11 w-full items-center justify-center rounded-8 bg-accent text-15 font-semibold text-white">
                  Sticky footer action
                </span>
              </div>
            </div>
          </Item>
          <Item label="Stacked sheets — back closes top">
            <Btn kind="out" className="h-9 px-3 text-13" onClick={() => setJump(true)}>
              Open a sheet
            </Btn>
          </Item>
          <Item label="Scrim spec">
            <p className="text-13 text-ink-secondary">
              rgba(0,0,0,.5) · fade 250ms · tap to close · sheet slides 300ms in / 250ms out, ease-out
              cubic-bezier(0.2,0,0,1)
            </p>
          </Item>
        </Spec>
      </Sec>

      {/* ----------------------------------------------------------- dialogs */}
      <Sec id="g-dialogs" title="Dialogs">
        <Spec>
          <Item label="Standard confirm">
            <Dlg>
              <p className="text-17 font-semibold">Mark as sold?</p>
              <p className="text-13 text-ink-secondary">Your listing will move to Sold and stop getting inquiries.</p>
              <div className="flex justify-end gap-2">
                <FakeBtn kind="sec">Cancel</FakeBtn>
                <FakeBtn>Mark sold</FakeBtn>
              </div>
            </Dlg>
          </Item>
          <Item label="Destructive">
            <Dlg>
              <p className="text-17 font-semibold">Remove this listing?</p>
              <p className="text-13 text-ink-secondary">This can&apos;t be undone. Your plan&apos;s listing slot stays used.</p>
              <div className="flex justify-end gap-2">
                <FakeBtn kind="sec">Cancel</FakeBtn>
                <FakeBtn kind="err">Remove</FakeBtn>
              </div>
            </Dlg>
          </Item>
          <Item label="Double-confirm with typed word">
            <Dlg>
              <p className="text-17 font-semibold">This will delete everything</p>
              <div>
                <span className="mb-1.5 block text-13 font-semibold">Type DELETE to confirm</span>
                <Inp placeholder="DELETE" />
              </div>
              <div className="flex justify-end gap-2">
                <FakeBtn kind="sec">Cancel</FakeBtn>
                <FakeBtn kind="err" className="opacity-40">Delete account</FakeBtn>
              </div>
            </Dlg>
          </Item>
          <Item label="Info popup">
            <Dlg center>
              <Icon name="info" size={32} className="text-accent" />
              <p className="text-17 font-semibold">What is a verified badge?</p>
              <p className="text-13 text-ink-secondary">
                Our team checked this owner&apos;s documents against the listing. It&apos;s not a guarantee of title.
              </p>
              <FakeBtn className="w-full">Got it</FakeBtn>
            </Dlg>
          </Item>
        </Spec>
      </Sec>

      {/* ------------------------------------------------------------ toasts */}
      <Sec id="g-toasts" title="Toasts">
        <Spec>
          <Item label="Plain"><FakeToast>Ticket created</FakeToast></Item>
          <Item label="With action link">
            <FakeToast>
              Listing saved <span className="font-semibold text-accent">View</span>
            </FakeToast>
          </Item>
          <Item label="Error"><FakeToast error>Still offline</FakeToast></Item>
          <Item label="Spec">
            <p className="text-13 text-ink-secondary">Position: bottom 80px, above nav · in 200ms · hold 3s · out 200ms</p>
            <Btn kind="out" className="mt-2 h-9 px-3 text-13" onClick={() => toast.show("Live toast demo")}>
              Fire a toast
            </Btn>
          </Item>
        </Spec>
      </Sec>

      {/* ------------------------------------------------------ empty states */}
      <Sec id="g-empty" title="Empty states — full family">
        <div className="grid grid-cols-2 gap-3">
          {EMPTIES.map(([icon, title, body, cta]) => (
            <div
              key={title + cta}
              className="flex flex-col items-center gap-1 rounded-12 border border-border bg-surface-1 px-3 py-4 text-center"
            >
              <Icon name={icon} size={40} className="mb-1 text-ink-tertiary" />
              <p className="text-15 font-semibold">{title}</p>
              <p className="text-11 text-ink-tertiary">{body}</p>
              <span className="px-2 text-13 font-semibold text-accent">{cta}</span>
            </div>
          ))}
        </div>
      </Sec>

      {/* --------------------------------------------------------- skeletons */}
      <Sec id="g-skel" title="Skeletons">
        <Spec>
          <Item label="Feed card">
            <div className="flex flex-col gap-2">
              <Sk className="aspect-[16/9] rounded-12" />
              <Sk className="h-4 w-2/5" />
              <Sk className="h-3 w-[70%]" />
            </div>
          </Item>
          <Item label="List row">
            <div className="flex gap-3">
              <Sk className="h-14 w-14" />
              <div className="flex flex-1 flex-col gap-2">
                <Sk className="h-3.5 w-4/5" />
                <Sk className="h-2.5 w-[45%]" />
              </div>
            </div>
          </Item>
          <Item label="Profile">
            <div className="flex gap-3">
              <Sk className="h-16 w-16 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Sk className="h-4 w-1/2" />
                <Sk className="h-2.5 w-[70%]" />
                <Sk className="h-2.5 w-[30%]" />
              </div>
            </div>
          </Item>
          <Item label="Grid">
            <div className="grid grid-cols-2 gap-2">
              <Sk className="aspect-square" />
              <Sk className="aspect-square" />
            </div>
          </Item>
          <Item label="Chat">
            <div className="flex flex-col gap-2">
              <Sk className="h-9 w-[60%] rounded-[12px_12px_12px_4px]" />
              <Sk className="h-9 w-1/2 self-end rounded-[12px_12px_4px_12px]" />
              <Sk className="h-9 w-[65%] rounded-[12px_12px_12px_4px]" />
            </div>
          </Item>
          <Item label="Shimmer spec">
            <p className="text-13 text-ink-secondary">
              surface2 base · linear-gradient sweep · 1.4s loop · respects reduced-motion
            </p>
          </Item>
        </Spec>
      </Sec>

      {/* ----------------------------------------------------------- avatars */}
      <Sec id="g-avatars" title="Avatars">
        <Spec>
          <Item label="Sizes 24 / 32 / 48 / 64 / 84">
            <div className="flex items-end gap-3">
              <Av size={24}>R</Av>
              <Av size={32}>RM</Av>
              <Av size={48}>RM</Av>
              <Av size={64}>RM</Av>
              <Av size={84}>RM</Av>
            </div>
          </Item>
          <Item label="Photo / initials / fallback icon">
            <div className="flex gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#B9CCC1] to-[#7E9C8B] text-white">
                <Icon name="user" size={20} />
              </span>
              <Av size={48}>PS</Av>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-3 text-ink-tertiary">
                <Icon name="user" size={20} />
              </span>
            </div>
          </Item>
          <Item label="Story rings — unseen / seen / project / boosted">
            <div className="flex gap-3">
              <Ring g="conic-gradient(var(--accent),#7BD9A8,var(--accent))" />
              <Ring g="var(--border)" />
              <Ring g="conic-gradient(#0095F6,#7CC4FA,#0095F6)" />
              <Ring g="conic-gradient(#F5A623,#FBD48A,#F5A623)" />
            </div>
          </Item>
          <Item label="With verified badge overlay">
            <span className="relative grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-20 font-semibold text-accent">
              RM
              <Icon
                name="verified"
                size={20}
                className="absolute -bottom-0.5 -right-0.5 rounded-full bg-page p-px text-accent"
              />
            </span>
          </Item>
        </Spec>
      </Sec>

      {/* -------------------------------------------------------------- bars */}
      <Sec id="g-bars" title="Bars">
        <Spec>
          <Item label="Header — default / scroll-morphed">
            <div className="flex flex-col gap-2">
              <div className="flex h-14 items-center gap-1 rounded-8 border border-divider bg-surface-1 px-2">
                <Icon name="arrow-left" size={24} className="mx-2.5" />
                <span className="text-17 font-semibold">3 BHK in Shivalik Residency</span>
              </div>
              <div className="flex h-12 items-center gap-1 rounded-8 border border-divider bg-surface-1 px-2 shadow-l2">
                <Icon name="arrow-left" size={24} className="mx-2.5" />
                <span className="flex flex-col">
                  <span className="text-13 font-semibold">₹85 Lakh · 3 BHK</span>
                  <span className="text-11 text-ink-tertiary">Kalawad Road</span>
                </span>
              </div>
            </div>
          </Item>
          <Item label="Bottom nav — 5 tabs (Home active · Chats unread)">
            <div className="flex rounded-12 border border-divider bg-surface-1">
              <NavTab icon="home" label="Home" active />
              <NavTab icon="search" label="Search" />
              <NavTab icon="plus" label="Post" fab />
              <NavTab icon="message" label="Chats" badge="3" />
              <NavTab icon="user" label="Profile" />
            </div>
          </Item>
          <Item label="Sticky detail bar — 3 variants">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 rounded-8 border border-divider bg-surface-1 p-3">
                <FakeBtn kind="out" className="flex-1"><Icon name="message" size={20} />Chat</FakeBtn>
                <FakeBtn className="flex-1"><Icon name="phone" size={20} className="text-white" />Call owner</FakeBtn>
              </div>
              <div className="flex items-center gap-3 rounded-8 border border-divider bg-surface-1 p-3">
                <span className="flex flex-1 flex-col">
                  <span className="text-13 font-semibold">Owner&apos;s number is locked</span>
                  <span className="text-11 text-ink-tertiary">Unlock with the ₹999 plan</span>
                </span>
                <FakeBtn><Icon name="lock" size={20} className="text-white" />Unlock</FakeBtn>
              </div>
              <div className="flex gap-2 rounded-8 border border-divider bg-surface-1 p-3">
                <span className="grid h-11 w-11 place-items-center rounded-8 border border-border"><Icon name="heart" size={24} /></span>
                <FakeBtn className="flex-1"><Icon name="send" size={20} className="text-white" />Send proposal</FakeBtn>
              </div>
            </div>
          </Item>
          <Item label="Usage bar">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-13 font-semibold">Proposals</span>
                <span className="text-13 text-ink-secondary">7 of 10 used</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full w-[70%] bg-accent" /></div>
            </div>
          </Item>
          <Item label="Progress dots">
            <div className="flex gap-1.5">
              {[1, 1, 0, 0, 0].map((on, i) => (
                <span key={i} className={cn("h-2 w-2 rounded-full", on ? "bg-accent" : "bg-surface-3")} />
              ))}
            </div>
          </Item>
          <Item label="Countdown bar">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-13 font-semibold">
                  <Icon name="clock" size={16} className="text-warning" />Boost ends in 3d 14h
                </span>
                <span className="text-13 font-semibold text-accent">Extend</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full w-[52%] bg-warning" /></div>
            </div>
          </Item>
          <Item label={'"New listings" pill'}>
            <span className="mx-auto flex w-max items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-13 font-semibold text-white shadow-l2">
              <Icon name="chevron-right" size={16} className="-rotate-90 text-white" />12 new listings
            </span>
          </Item>
          <Item label="Offline banner">
            <div className="flex items-center justify-center gap-2 rounded-8 bg-ink-primary px-4 py-2 text-13 text-page">
              <Icon name="wifi-off" size={16} />
              You&apos;re offline — showing saved data
            </div>
          </Item>
          <Item label="Admin banner slot">
            <div className="flex items-center justify-center gap-2 rounded-8 border-[1.5px] border-dashed border-border px-4 py-2.5 text-13 text-ink-tertiary">
              Admin announcement slot · dismissible · infoSoft bg
            </div>
          </Item>
        </Spec>
      </Sec>

      {/* -------------------------------------------------------------- misc */}
      <Sec id="g-misc" title="Misc" last>
        <Spec>
          <Item label="NumberCard">
            <Card className="flex flex-col gap-2 border-accent p-4">
              <p className="text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Owner&apos;s number</p>
              <div className="flex items-center justify-between">
                <span className="text-20 font-bold">+91 98242 55482</span>
                <FakeBtn className="h-9 px-3 text-13"><Icon name="phone" size={16} className="text-white" />Call</FakeBtn>
              </div>
              <p className="text-11 text-ink-tertiary">Shared with you after Rakesh accepted your inquiry · 12 Jan</p>
            </Card>
          </Item>
          <Item label="System message card">
            <div className="rounded-8 bg-surface-2 px-4 py-2.5 text-center text-11 text-ink-tertiary">
              Rakesh accepted your inquiry. His number is now visible to you.
            </div>
          </Item>
          <Item label="Quoted reply">
            <div className="max-w-full rounded-12 rounded-br-[4px] bg-accent-soft px-3 py-2.5 text-15 leading-[1.45]">
              <div className="mb-1.5 rounded-6 border-l-[3px] border-accent bg-black/5 px-2.5 py-1.5 text-13 text-ink-secondary">
                Is the society pet-friendly?
              </div>
              Yes — small pets are fine, there&apos;s a register at the gate.
            </div>
          </Item>
          <Item label="Reaction chip">
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-surface-2 px-2.5">
              <Icon name="heart" size={16} filled className="text-error" />
              <span className="text-11 font-semibold">2</span>
            </span>
          </Item>
          <Item label="Date separator / unread divider">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-divider" />
                <span className="text-11 text-ink-tertiary">Yesterday</span>
                <span className="h-px flex-1 bg-divider" />
              </div>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-error" />
                <span className="text-11 font-semibold uppercase tracking-[0.3px] text-error">Unread messages</span>
                <span className="h-px flex-1 bg-error" />
              </div>
            </div>
          </Item>
          <Item label="Typing indicator">
            <span className="flex w-14 items-center justify-center gap-1 rounded-12 rounded-bl-[4px] bg-surface-2 px-3 py-2.5">
              {[0, 0.15, 0.3].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-[dotb_1.2s_infinite] rounded-full bg-ink-tertiary"
                  style={{ animationDelay: `${d}s` }}
                />
              ))}
            </span>
          </Item>
          <Item label="Coach mark">
            <div className="relative pt-2.5">
              <span className="absolute left-7 top-0.5 h-3.5 w-3.5 rotate-45 bg-ink-primary" />
              <div className="max-w-[260px] rounded-8 bg-ink-primary px-4 py-3 text-13 text-page">
                Tap the flame to mark your requirement urgent — owners reply 2× faster.
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-11 opacity-60">1 of 3</span>
                  <span className="text-13 font-semibold text-accent">Next</span>
                </div>
              </div>
            </div>
          </Item>
          <Item label="QR card">
            <Card className="flex items-center gap-4 p-4">
              <span className="grid h-[84px] w-[84px] place-items-center rounded-8 bg-surface-2">
                <Icon name="qr-code" size={48} />
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-15 font-semibold">Share your listing offline</span>
                <span className="text-13 text-ink-secondary">Print this QR for your window or society noticeboard</span>
                <span className="text-13 font-semibold text-accent">Download QR</span>
              </div>
            </Card>
          </Item>
          <Item label="OG share-image template (1200×630)">
            <div className="relative aspect-[1200/630] overflow-hidden rounded-12 border border-border bg-gradient-to-br from-[#C9C2B4] to-[#948A74]">
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent to-60%" />
              <span className="absolute left-3.5 top-3 text-15 font-bold text-white">
                Homz<b className="text-[#4ADE8C]">List</b>
              </span>
              <div className="absolute bottom-3 left-3.5 text-white">
                <p className="text-20 font-bold">₹85 Lakh · 3 BHK</p>
                <p className="text-13 opacity-85">Shivalik Residency, Kalawad Road, Rajkot</p>
              </div>
              <span className="absolute right-3 top-3">
                <Bdg cls="bg-accent text-white">For Sale</Bdg>
              </span>
            </div>
          </Item>
          <Item label="Watermark on photo">
            <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-12 bg-gradient-to-br from-[#D0BFB4] to-[#9A8271] text-white/75">
              <Icon name="home" size={48} />
              <span className="absolute inset-0 flex -rotate-[18deg] items-center justify-center text-24 font-bold tracking-[2px] text-white/35">
                HomzList
              </span>
              <span className="absolute bottom-1.5 right-2 text-11 text-white/80">HL-88213</span>
            </div>
          </Item>
          <Item label="Cascade section header">
            <div className="flex items-center gap-3">
              <span className="text-17 font-semibold">Mavdi</span>
              <span className="text-13 text-ink-tertiary">124 listings</span>
              <span className="h-px flex-1 bg-divider" />
              <span className="text-13 font-semibold text-accent">See all</span>
            </div>
          </Item>
          <Item label="Rich link preview">
            <Card className="flex overflow-hidden">
              <span className="flex h-[84px] w-[84px] shrink-0 items-center justify-center bg-gradient-to-br from-[#BFC7B4] to-[#87926F] text-white/75">
                <Icon name="home" size={20} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
                <span className="truncate text-13 font-semibold">₹52 Lakh · 2 BHK in Mavdi — HomzList</span>
                <span className="truncate text-11 text-ink-tertiary">Ready to move · 1,050 sq ft · Verified owner</span>
                <span className="text-11 text-ink-tertiary">homzlist.com</span>
              </div>
            </Card>
          </Item>
          <Item label="Install prompt — Android">
            <Card className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-11 w-11 place-items-center rounded-[10px] bg-accent text-20 font-bold text-white">H</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-15 font-semibold">Install HomzList</span>
                <span className="text-11 text-ink-tertiary">Fast, light, works offline</span>
              </div>
              <FakeBtn className="h-9 px-3 text-13">Install</FakeBtn>
              <Icon name="close" size={20} className="text-ink-tertiary" />
            </Card>
          </Item>
          <Item label="iOS install guide overlay">
            <div className="flex flex-col rounded-12 bg-ink-primary p-4 text-page">
              <p className="text-15 font-semibold">Add HomzList to your Home Screen</p>
              <p className="mt-1 text-13 opacity-75">
                Tap the <Icon name="share" size={16} className="inline align-[-3px]" /> Share button, then &quot;Add to
                Home Screen&quot;.
              </p>
            </div>
          </Item>
          <Item label="Cookie consent (guest first visit)">
            <div className="flex flex-col gap-2.5 rounded-12 border border-border bg-surface-1 p-4 shadow-l2">
              <p className="text-13 text-ink-secondary">
                We use cookies to keep you signed in and improve HomzList. Read our{" "}
                <a href="/legal/privacy" className="text-accent">Privacy Policy</a> and{" "}
                <a href="/legal/cookie" className="text-accent">Cookie Policy</a>.
              </p>
              <div className="flex gap-2">
                <Btn kind="out" className="h-9 flex-1 px-3 text-13" onClick={() => toast.show("Cookie preferences")}>
                  Manage
                </Btn>
                <Btn className="h-9 flex-1 px-3 text-13" onClick={() => toast.show("Cookies accepted")}>
                  Accept
                </Btn>
              </div>
            </div>
          </Item>
          <Item label="Error illustration family — one visual language">
            <div className="grid grid-cols-4 gap-2 text-center">
              <ErrTile label="Not found">
                <span className="flex items-center gap-0.5 text-17 font-bold text-ink-tertiary">
                  4<Icon name="home" size={24} className="text-accent" />4
                </span>
              </ErrTile>
              <ErrTile label="Offline"><Icon name="cloud-off" size={32} className="text-ink-tertiary" /></ErrTile>
              <ErrTile label="Maintenance"><Icon name="wrench" size={32} className="text-ink-tertiary" /></ErrTile>
              <ErrTile label="Crash"><Icon name="alert" size={32} className="text-ink-tertiary" /></ErrTile>
            </div>
          </Item>
        </Spec>
      </Sec>

      <BottomSheet open={jump} onClose={() => setJump(false)} title="Jump to section">
        <List>
          {SECTIONS.map((s) => (
            <Row key={s.id} label={s.label} chevron={false} onClick={() => go(s.id)} className="min-h-12" />
          ))}
        </List>
      </BottomSheet>
    </AppShell>
  );
}

/* ------------------------------------------------------------- local pieces */

function Sec({ id, title, children, last }: { id: string; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <section id={id} className={cn("scroll-mt-[108px] p-4", !last && "border-b-8 border-surface-2")}>
      <h2 className="mb-3 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{title}</h2>
      {children}
    </section>
  );
}

const Spec = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col gap-3 rounded-12 bg-surface-2 p-4">{children}</div>
);

const Item = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-1.5 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{label}</p>
    {children}
  </div>
);

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2">{children}</div>
);

const Swatch = ({ name, hex, dark }: { name: string; hex: string; dark?: boolean }) => (
  <div>
    <div className="h-10 rounded-8 border border-border" style={{ background: hex }} />
    <p className={cn("mt-1 text-11", dark ? "text-[#B0B0B0]" : "text-ink-primary")}>
      {name}
      <br />
      <span className="text-ink-tertiary">{hex}</span>
    </p>
  </div>
);

function Btn({
  children,
  kind = "pri",
  className,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  kind?: "pri" | "sec" | "out" | "txt" | "err" | "erro";
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const base = "chrome inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-8 px-4 text-15 font-semibold transition-transform active:scale-[0.98]";
  const kinds = {
    pri: "bg-accent text-white disabled:bg-accent-disabled",
    sec: "bg-surface-2 text-ink-primary",
    out: "border border-border bg-transparent text-ink-primary",
    txt: "bg-transparent px-2 text-accent",
    err: "bg-error text-white disabled:opacity-40",
    erro: "border border-error bg-transparent text-error",
  }[kind];
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={cn(base, kinds, className)}>
      {children}
    </button>
  );
}

const FakeBtn = ({ children, kind = "pri", className }: { children: React.ReactNode; kind?: "pri" | "sec" | "out" | "err"; className?: string }) => (
  <span
    className={cn(
      "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-8 px-4 text-15 font-semibold",
      kind === "pri" && "bg-accent text-white",
      kind === "sec" && "bg-surface-2 text-ink-primary",
      kind === "out" && "border border-border text-ink-primary",
      kind === "err" && "bg-error text-white",
      className,
    )}
  >
    {children}
  </span>
);

const IconBtn = ({ className }: { className?: string }) => (
  <span className={cn("grid h-11 w-11 place-items-center rounded-8 border border-border text-ink-primary", className)}>
    <Icon name="heart" size={24} />
  </span>
);

const Spin = ({ dark }: { dark?: boolean }) => (
  <span
    className={cn(
      "h-[18px] w-[18px] animate-spin rounded-full border-2",
      dark ? "border-surface-3 border-t-accent" : "border-white/35 border-t-white",
    )}
  />
);

const Inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={cn(
      "h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none placeholder:text-ink-tertiary",
      props.className,
    )}
  />
);

const Bdg = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
  <span className={cn("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-4 px-1.5 text-11 font-semibold uppercase tracking-[0.3px]", cls)}>
    {children}
  </span>
);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("overflow-hidden rounded-12 border border-border bg-surface-1 shadow-l1", className)}>{children}</div>
);

const Sk = ({ className }: { className?: string }) => <Skeleton className={className} />;

const Av = ({ size, children }: { size: number; children: React.ReactNode }) => (
  <span
    className="grid shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent"
    style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size / 3.2)) }}
  >
    {children}
  </span>
);

const Ring = ({ g }: { g: string }) => (
  <span className="inline-flex rounded-full p-0.5" style={{ background: g }}>
    <span className="h-12 w-12 rounded-full border-2 border-page bg-gradient-to-br from-[#C9C2B4] to-[#948A74]" />
  </span>
);

const Dlg = ({ children, center }: { children: React.ReactNode; center?: boolean }) => (
  <div
    className={cn(
      "mx-auto flex w-full max-w-[330px] flex-col gap-3 rounded-16 bg-surface-1 p-6 shadow-l2",
      center && "items-center text-center",
    )}
  >
    {children}
  </div>
);

const FakeToast = ({ children, error }: { children: React.ReactNode; error?: boolean }) => (
  <span
    className={cn(
      "inline-flex items-center gap-3 self-start rounded-8 px-4 py-2.5 text-13 shadow-l2",
      error ? "bg-error text-white" : "bg-ink-primary text-page",
    )}
  >
    {children}
  </span>
);

const NavTab = ({
  icon,
  label,
  active,
  badge,
  fab,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: string;
  fab?: boolean;
}) => (
  <span
    className={cn(
      "relative flex flex-1 flex-col items-center gap-0.5 pb-2.5 pt-2 text-11",
      active ? "font-semibold text-ink-primary" : "text-ink-tertiary",
    )}
  >
    {fab ? (
      <span className="-mt-2.5 grid h-9 w-9 place-items-center rounded-[10px] bg-accent text-white">
        <Icon name={icon} size={20} />
      </span>
    ) : (
      <Icon name={icon} size={24} />
    )}
    {label}
    {badge && (
      <i className="absolute right-[22%] top-1.5 grid h-4 w-4 place-items-center rounded-full bg-error text-[9px] font-semibold not-italic text-white">
        {badge}
      </i>
    )}
  </span>
);

const ErrTile = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col items-center gap-1.5 rounded-12 border border-border bg-surface-1 px-1 py-3">
    {children}
    <span className="text-11 text-ink-tertiary">{label}</span>
  </div>
);

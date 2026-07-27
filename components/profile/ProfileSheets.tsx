"use client";

import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DeviceAccount } from "@/lib/auth/client";
import type { FeaturedItem } from "@/lib/profile/client";
import { cn } from "@/lib/utils";

/**
 * Account-switch sheet (P9 S1). Every account signed in on this device, the
 * active one check-marked, then Add account + Log out.
 *
 * `accounts` is the server's answer (GET /auth/accounts) — the client keeps no
 * account list of its own. Long-pressing a non-active row asks to sign that
 * account out of the device; the design has no visible remove control and none
 * is added.
 */
export function AccountSwitchSheet({
  open,
  onClose,
  accounts,
  loading,
  busyId,
  onSwitch,
  onRequestRemove,
  onAddAccount,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  accounts: DeviceAccount[];
  loading: boolean;
  /** Account currently being switched into / removed — its row shows a spinner. */
  busyId: string | null;
  onSwitch: (a: DeviceAccount) => void;
  onRequestRemove: (a: DeviceAccount) => void;
  onAddAccount: () => void;
  onLogout: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Switch account">
      <div className="flex flex-col">
        {loading && !accounts.length ? (
          <div className="flex items-center gap-3 py-2">
            <Skeleton className="h-10 w-10 rounded-full" />
            <span className="flex-1">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="mt-1.5 h-2.5 w-20" />
            </span>
          </div>
        ) : (
          accounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              busy={busyId === a.id}
              onSwitch={() => onSwitch(a)}
              onLongPress={() => onRequestRemove(a)}
            />
          ))
        )}
        <div className="my-1 h-px bg-divider" />
        <button onClick={onAddAccount} className="flex h-12 items-center gap-3 text-left text-15 font-semibold text-accent">
          <Icon name="user-plus" size={20} strokeWidth={1.9} /> Add account
        </button>
        <button onClick={onLogout} className="flex h-12 items-center gap-3 text-left text-15 text-error">
          <Icon name="log-out" size={20} strokeWidth={1.7} /> Log out
        </button>
      </div>
    </BottomSheet>
  );
}

/**
 * One account row. Identical to the design for both states — the only difference
 * between active and background is the check mark, exactly as drawn. Long-press
 * (500ms) on a background row is the hidden remove affordance; it cancels the
 * tap so a press never both removes and switches.
 */
function AccountRow({
  account,
  busy,
  onSwitch,
  onLongPress,
}: {
  account: DeviceAccount;
  busy: boolean;
  onSwitch: () => void;
  onLongPress: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const start = () => {
    if (account.current) return; // the active account leaves via Log out
    fired.current = false;
    clear();
    timer.current = setTimeout(() => {
      fired.current = true;
      // A remove is destructive — give the same haptic the OS gives a long-press.
      navigator.vibrate?.(15);
      onLongPress();
    }, 500);
  };

  return (
    <button
      type="button"
      disabled={account.current || busy}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => {
        // Desktop/tablet equivalent of the long-press.
        if (account.current) return;
        e.preventDefault();
        onLongPress();
      }}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        if (!account.current) onSwitch();
      }}
      className="flex items-center gap-3 py-2 text-left disabled:opacity-100"
    >
      <Avatar name={account.name} src={account.photoUrl ?? undefined} size={40} />
      <span className="flex-1">
        <span className="block text-15 font-semibold text-ink-primary">{account.username}</span>
        <span className="block text-11 text-ink-tertiary">{account.roleCity}</span>
      </span>
      {busy ? (
        <Spinner />
      ) : (
        account.current && <Icon name="check" size={20} className="text-accent" strokeWidth={2} />
      )}
    </button>
  );
}

function Spinner() {
  return <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" aria-label="Switching" />;
}

/** Profile menu sheet (⋯). */
export function ProfileMenuSheet({
  open,
  onClose,
  onAccountStatus,
  onViewAsVisitor,
  onQr,
  onPlaceholder,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onAccountStatus: () => void;
  onViewAsVisitor: () => void;
  onQr: () => void;
  onPlaceholder: (what: string) => void;
  /** Route push for the seller destinations below. */
  onNavigate: (href: string) => void;
}) {
  const Row = ({ icon, label, badge, onClick }: { icon: IconName; label: string; badge?: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex h-12 w-full items-center gap-3 text-left text-15 text-ink-primary active:bg-surface-2">
      <Icon name={icon} size={22} strokeWidth={1.7} />
      <span className="flex-1">{label}</span>
      {badge && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-11 font-semibold text-ink-inverse">{badge}</span>}
    </button>
  );
  return (
    <BottomSheet open={open} onClose={onClose} hideHeader>
      <div className="flex flex-col pt-1">
        {/* Seller destinations — this is where an under-review listing, the
            plan and payment history live (Doc4 §56/§62). */}
        <Row icon="home" label="My Listings" onClick={() => onNavigate("/listings")} />
        <Row icon="search" label="Browse requirements" onClick={() => onNavigate("/requirements")} />
        <Row icon="file" label="My requirements" onClick={() => onNavigate("/requirements/mine")} />
        <Row icon="send" label="My proposals" onClick={() => onNavigate("/proposals")} />
        <Row icon="pin" label="My visits" onClick={() => onNavigate("/visits")} />
        <Row icon="filter" label="Leads" onClick={() => onNavigate("/leads")} />
        <Row icon="card" label="My plan" onClick={() => onNavigate("/plans/my")} />
        <Row icon="receipt" label="Payments" onClick={() => onNavigate("/payments")} />
        <Row icon="rocket" label="Boosts" onClick={() => onNavigate("/boost")} />
        <span className="my-1 h-px bg-divider" />
        <Row icon="user" label="Settings" onClick={() => onPlaceholder("Settings")} />
        <Row icon="bookmark" label="Saved" onClick={() => onPlaceholder("Saved")} />
        <Row icon="home" label="Your activity" onClick={() => onPlaceholder("Your activity")} />
        <Row icon="image" label="Drafts" onClick={() => onNavigate("/create/drafts")} />
        <Row icon="bookmark" label="Archived" onClick={() => onPlaceholder("Archived")} />
        <Row icon="alert" label="Account status" onClick={onAccountStatus} />
        <Row icon="user" label="View as visitor" onClick={onViewAsVisitor} />
        <Row icon="qr-code" label="QR code" onClick={onQr} />
        <Row icon="message" label="Help" onClick={() => onPlaceholder("Help")} />
      </div>
    </BottomSheet>
  );
}

/**
 * "Create featured" sheet (P9 S1 `Sheets.featured`): Name field, "Choose
 * listings" label, a 3-column tile grid where a picked tile takes a 2px accent
 * outline, then the Create button — exactly the design's four elements.
 *
 * Only live, available listings can go in: a collection circle is a public
 * shelf, so offering a hidden or sold listing would create a shelf that renders
 * empty to everyone.
 */
export function CreateFeaturedSheet({
  open,
  onClose,
  listings,
  maxItems,
  busy,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  listings: { id: string; coverUrl: string | null; title: string | null }[];
  maxItems: number;
  busy: boolean;
  onCreate: (name: string, listingIds: string[]) => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  // A fresh sheet every time it opens — a half-filled form from last time is
  // never what the user meant.
  useEffect(() => {
    if (open) {
      setName("");
      setPicked([]);
    }
  }, [open]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= maxItems ? p : [...p, id]));

  const canCreate = name.trim().length > 0 && picked.length > 0 && !busy;

  return (
    <BottomSheet open={open} onClose={onClose} title="Create featured">
      <div className="flex flex-col">
        <label htmlFor="featured-name" className="chrome mb-1.5 text-13 font-semibold text-ink-secondary">
          Name
        </label>
        <input
          id="featured-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="e.g. Ready to move"
          className="h-11 w-full rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none placeholder:text-ink-tertiary focus:border-accent"
        />

        <p className="chrome mb-1.5 mt-4 text-13 font-semibold text-ink-secondary">Choose listings</p>
        {listings.length === 0 ? (
          <p className="py-6 text-center text-13 text-ink-secondary">
            You need a live listing before you can group one into a collection.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {listings.map((l) => {
              const on = picked.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggle(l.id)}
                  aria-pressed={on}
                  aria-label={l.title ?? "Listing"}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-8 bg-surface-3",
                    on && "outline outline-2 -outline-offset-2 outline-accent",
                  )}
                >
                  {l.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-ink-tertiary">
                      <Icon name="home" size={26} strokeWidth={1.6} />
                    </span>
                  )}
                  {on && (
                    <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-ink-inverse">
                      <Icon name="check" size={13} strokeWidth={2.6} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <Button className="mt-4" disabled={!canCreate} loading={busy} onClick={() => onCreate(name.trim(), picked)}>
          Create
        </Button>
      </div>
    </BottomSheet>
  );
}

/**
 * Tapping an existing circle. The design stops at creating one, so this is the
 * smallest thing that makes the circle real: what's inside, each tile opening
 * its listing, and Remove collection.
 *
 * `onRemove` is omitted on someone else's profile (P9 S2) — a visitor browses a
 * shelf, they never curate it, so the row simply isn't rendered rather than
 * being shown and failing.
 */
export function FeaturedCollectionSheet({
  open,
  onClose,
  collection,
  items,
  loading,
  onOpenListing,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  collection: { id: string; name: string } | null;
  items: FeaturedItem[] | null;
  loading: boolean;
  onOpenListing: (id: string) => void;
  onRemove?: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={collection?.name ?? "Featured"}>
      <div className="flex flex-col">
        {loading || items === null ? (
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-8" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-13 text-ink-secondary">
            Nothing in this collection is live right now.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {items.map((l) => (
              <button
                key={l.id}
                onClick={() => onOpenListing(l.id)}
                aria-label={l.title ?? "Listing"}
                className="relative aspect-square overflow-hidden rounded-8 bg-surface-3"
              >
                {l.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-ink-tertiary">
                    <Icon name="home" size={26} strokeWidth={1.6} />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {onRemove && (
          <button onClick={onRemove} className="mt-2 flex h-12 items-center gap-3 text-left text-15 text-error">
            <Icon name="trash" size={20} strokeWidth={1.7} /> Remove collection
          </button>
        )}
      </div>
    </BottomSheet>
  );
}

/** QR sheet — white card, QR graphic (placeholder), name/role/link + Download/Share. */
export function QRSheet({
  open,
  onClose,
  name,
  roleCity,
  username,
  onShare,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  roleCity: string;
  username: string;
  onShare: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Profile QR">
      <div className="flex flex-col items-center rounded-16 bg-white p-6 text-center shadow-l1 dark:border dark:border-border dark:bg-surface-1">
        {/* Stylised QR placeholder (accent-tinted, "H" centre) */}
        <div className="relative grid h-40 w-40 place-items-center rounded-12 bg-accent-soft">
          <QRGraphic />
          <span className="absolute grid h-9 w-9 place-items-center rounded-8 bg-accent text-ink-inverse">
            <span className="text-17 font-bold">H</span>
          </span>
        </div>
        <p className="mt-4 text-17 font-semibold text-ink-primary">{name}</p>
        <p className="text-13 text-ink-tertiary">{roleCity}</p>
        <p className="mt-1 text-11 text-ink-tertiary">homzlist.com/{username}</p>
        <div className="mt-4 flex w-full gap-2">
          <Button variant="outline" className="flex-1" onClick={onShare}>
            Download
          </Button>
          <Button className="flex-1" onClick={onShare}>
            Share
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}

function QRGraphic() {
  // Decorative QR-like pattern (not a scannable code — real QR generated server-side later).
  const cells = Array.from({ length: 49 });
  return (
    <div className={cn("grid grid-cols-7 gap-[3px] p-3")}>
      {cells.map((_, i) => (
        <span key={i} className="h-3 w-3 rounded-[2px]" style={{ background: (i * 7 + ((i * 13) % 5)) % 3 === 0 ? "var(--accent)" : "transparent" }} />
      ))}
    </div>
  );
}

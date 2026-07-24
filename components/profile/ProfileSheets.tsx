"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/** Account-switch sheet (P9 S1). Current account + add + logout. */
export function AccountSwitchSheet({
  open,
  onClose,
  current,
  onAddAccount,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  current: { username: string; roleCity: string; name: string; photoUrl: string | null };
  onAddAccount: () => void;
  onLogout: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Switch account">
      <div className="flex flex-col">
        <div className="flex items-center gap-3 py-2">
          <Avatar name={current.name} src={current.photoUrl ?? undefined} size={40} />
          <span className="flex-1">
            <span className="block text-15 font-semibold text-ink-primary">{current.username}</span>
            <span className="block text-11 text-ink-tertiary">{current.roleCity}</span>
          </span>
          <Icon name="check" size={20} className="text-accent" strokeWidth={2} />
        </div>
        <div className="my-1 h-px bg-divider" />
        <button onClick={onAddAccount} className="flex h-12 items-center gap-3 text-left text-15 font-semibold text-accent">
          <Icon name="plus" size={20} strokeWidth={1.9} /> Add account
        </button>
        <button onClick={onLogout} className="flex h-12 items-center gap-3 text-left text-15 text-error">
          <Icon name="arrow-left" size={20} strokeWidth={1.7} /> Log out
        </button>
      </div>
    </BottomSheet>
  );
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
        <Row icon="image" label="QR code" onClick={onQr} />
        <Row icon="message" label="Help" onClick={() => onPlaceholder("Help")} />
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

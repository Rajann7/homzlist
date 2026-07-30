"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

/**
 * P12's share sheet — four 56px circular actions: WhatsApp, Copy link, Email,
 * More. Every one is real: WhatsApp and Email open the platform's own share
 * targets, Copy uses the clipboard, and "More" uses the Web Share API where the
 * device has one and falls back to copying where it doesn't (so the button is
 * never dead).
 */
export function ShareSheet({
  open,
  onClose,
  url,
  title,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}) {
  const toast = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show("Copied to clipboard");
    } catch {
      toast.show("Couldn't copy the link", { variant: "error" });
    }
    onClose();
  };

  const system = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* user dismissed the OS sheet */
      }
      onClose();
      return;
    }
    await copy();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Share">
      <div className="flex justify-center gap-5 px-6 pb-4 pt-2">
        <Action
          icon="whatsapp"
          label="WhatsApp"
          accent
          href={`https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`}
        />
        <Action icon="copy" label="Copy link" onClick={copy} />
        <Action
          icon="mail"
          label="Email"
          href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`}
        />
        <Action icon="more" label="More" onClick={system} />
      </div>
    </BottomSheet>
  );
}

function Action({
  icon,
  label,
  onClick,
  href,
  accent,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  href?: string;
  accent?: boolean;
}) {
  const circle = `grid h-14 w-14 place-items-center rounded-full active:scale-[0.98] transition-transform ${
    accent ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-primary"
  }`;
  return (
    <div className="flex flex-col items-center gap-1.5">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`chrome ${circle}`} aria-label={label}>
          <Icon name={icon} size={24} />
        </a>
      ) : (
        <button type="button" onClick={onClick} className={`chrome ${circle}`} aria-label={label}>
          <Icon name={icon} size={24} />
        </button>
      )}
      <span className="chrome text-11 text-ink-primary">{label}</span>
    </div>
  );
}

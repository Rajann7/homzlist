"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

/**
 * P12's share sheet — four circular 56px actions in a row: WhatsApp, Copy link,
 * Email, More.
 *
 * "More" is the platform share sheet where the browser has one; where it does
 * not, it falls back to copying, because a button that silently does nothing is
 * the dead control CLAUDE.md's hidden-issue hunt is about.
 */

const ACTION_CLASS =
  "grid h-14 w-14 place-items-center rounded-full transition-transform active:scale-[0.98]";

export function ShareSheet({
  open,
  onClose,
  url,
  title,
  text,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  text?: string;
}) {
  const toast = useToast();

  const absolute = () => (url.startsWith("http") ? url : `${window.location.origin}${url}`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absolute());
      toast.show("Copied to clipboard");
    } catch {
      toast.show("Couldn't copy — long-press the link instead");
    }
    onClose();
  };

  const whatsapp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${title}\n${absolute()}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
    onClose();
  };

  const email = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(
      `${text ? `${text}\n\n` : ""}${absolute()}`,
    )}`;
    onClose();
  };

  const more = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: absolute() });
        onClose();
        return;
      } catch {
        /* user dismissed the native sheet — fall through to copy */
      }
    }
    await copy();
  };

  const items: { key: string; label: string; icon: IconName; accent?: boolean; onClick: () => void }[] = [
    { key: "wa", label: "WhatsApp", icon: "whatsapp", accent: true, onClick: whatsapp },
    { key: "copy", label: "Copy link", icon: "copy", onClick: () => void copy() },
    { key: "mail", label: "Email", icon: "mail", onClick: email },
    { key: "more", label: "More", icon: "more", onClick: () => void more() },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title="Share">
      <div className="flex justify-center gap-5 px-6 pb-4 pt-2">
        {items.map((it) => (
          <div key={it.key} className="flex flex-col items-center gap-1.5">
            <button
              onClick={it.onClick}
              aria-label={it.label}
              className={`${ACTION_CLASS} ${it.accent ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-primary"}`}
            >
              <Icon name={it.icon} size={24} />
            </button>
            <span className="text-11 text-ink-primary">{it.label}</span>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

/**
 * Share sheet for the area/landing page (designs/P3 S4 header + share sheet):
 * preview row, link row with Copy, and the WhatsApp / Copy / More destinations.
 */
export function ShareAreaButton({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const link = typeof location !== "undefined" ? location.href : "";

  const copy = () => {
    void navigator.clipboard?.writeText(link);
    setOpen(false);
    toast.show("Link copied");
  };

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Share" className="grid h-11 w-11 place-items-center">
        <Icon name="share" size={21} strokeWidth={1.7} className="text-ink-primary" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Share">
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex items-center gap-3 rounded-12 bg-surface-2 p-3">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-8 bg-accent-soft">
              <Icon name="pin" size={24} className="text-accent" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-15 font-semibold text-ink-primary">{title}</div>
              <div className="mt-[3px] text-13 text-ink-tertiary">HomzList</div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-8 border border-border bg-surface-2 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-13 text-ink-secondary">{link}</span>
            <button onClick={copy} className="text-13 font-semibold text-accent">Copy</button>
          </div>

          <div className="flex justify-around">
            <Dest
              label="WhatsApp"
              icon="message"
              onClick={() => {
                window.open(`https://wa.me/?text=${encodeURIComponent(`${title} — ${link}`)}`, "_blank", "noopener,noreferrer");
                setOpen(false);
              }}
            />
            <Dest label="Copy" icon="copy" onClick={copy} />
            <Dest
              label="More"
              icon="share"
              onClick={() => {
                if (navigator.share) void navigator.share({ title, url: link });
                else copy();
                setOpen(false);
              }}
            />
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

function Dest({ label, icon, onClick }: { label: string; icon: "message" | "copy" | "share"; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <span className="grid h-13 w-13 place-items-center rounded-full bg-surface-2 p-3.5">
        <Icon name={icon} size={22} className="text-ink-primary" />
      </span>
      <span className="text-11 text-ink-secondary">{label}</span>
    </button>
  );
}

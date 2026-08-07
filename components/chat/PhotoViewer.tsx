"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { Img } from "@/components/ui/Img";

/**
 * P7 full-screen photo viewer (design PHOTO VIEWER — fixed inset-0 dim backdrop).
 * Opened by tapping a photo bubble in the thread or a shared photo in details.
 * Tap the backdrop or the close button (or Esc) to dismiss.
 */
export function PhotoViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  if (!url) return null;
  return (
    <div onClick={onClose} className="animate-scrim-in fixed inset-0 z-viewer flex items-center justify-center bg-black/95">
      <button aria-label="Close" onClick={onClose} className="absolute right-3 top-[calc(env(safe-area-inset-top)+12px)] grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white">
        <Icon name="close" size={24} />
      </button>
      <Img src={url} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[92vh] max-w-full object-contain" />
    </div>
  );
}

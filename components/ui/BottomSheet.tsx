"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/**
 * BottomSheet — Doc1 Component 8, motion §4.
 * 12px top radius, 36×4 drag-handle, title row (17/600 + X), content scrolls
 * INSIDE the body (never clipped — Doc6 §5.3), safe-area bottom pad, max-h 90%.
 * Closes on: X, backdrop tap, Esc, swipe-down. Scrim fades in parallel.
 * Stacking supported (each instance renders its own scrim; back closes top-first).
 */

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Hide the default header (for fully custom sheets). */
  hideHeader?: boolean;
  className?: string;
}

export function BottomSheet({ open, onClose, title, children, hideHeader, className }: BottomSheetProps) {
  const startY = useRef<number | null>(null);
  const dragY = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Swipe-down to dismiss (Doc1 §4 — dismiss if >50% dragged; velocity omitted for brevity).
  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    dragY.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null || !panelRef.current) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      dragY.current = dy;
      panelRef.current.style.transform = `translateY(${dy}px)`;
    }
  };
  const onTouchEnd = () => {
    if (!panelRef.current) return;
    const h = panelRef.current.offsetHeight || 1;
    if (dragY.current > h * 0.5) onClose();
    else panelRef.current.style.transform = "";
    startY.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-sheet-scrim flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Scrim */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-scrim-in bg-[color:var(--scrim-sheet)]"
        tabIndex={-1}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={cn(
          "relative z-sheet flex max-h-[90dvh] w-full max-w-column animate-sheet-in flex-col",
          "rounded-t-12 bg-surface-1 shadow-l3 dark:border-t dark:border-x dark:border-border",
          className,
        )}
      >
        {/* Drag-handle zone (32px) */}
        <div className="chrome grid h-8 shrink-0 place-items-center">
          <span className="h-1 w-9 rounded-full bg-surface-3" />
        </div>
        {!hideHeader && title && (
          <div className="chrome flex shrink-0 items-center justify-between px-4 pb-2">
            <h2 className="text-17 font-semibold text-ink-primary">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-11 w-11 -mr-2 place-items-center text-ink-primary"
            >
              <Icon name="close" size={22} strokeWidth={1.7} />
            </button>
          </div>
        )}
        {/* Body scrolls inside the sheet (Doc6 §5.3) */}
        <div className="safe-bottom overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

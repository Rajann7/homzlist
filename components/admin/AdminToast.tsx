"use client";

import { useCallback, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * The admin toast, exactly as the design's shell draws it:
 *
 *   position: absolute · left 50% · bottom 76px · translateX(-50%)
 *   background var(--ink1) · color var(--page) · 13px/600
 *   padding 12px 16px · radius 8 · shadow L3 · gap 10
 *   a check icon in var(--accent) before the text
 *   max-width 90%
 *
 * Every admin screen was carrying its own copy of a toast, each slightly
 * different from the design and from each other. One component means the shell's
 * toast is THE toast (PROOF.md propagation rule applied to a component).
 *
 * `fixed` rather than `absolute` because the design positions inside its device
 * frame; in the real panel the toast must sit against the viewport.
 */
export function AdminToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="fixed bottom-[76px] left-1/2 z-[140] flex max-w-[90%] -translate-x-1/2 items-center gap-[10px] rounded-8 px-4 py-3 text-[13px] font-semibold"
      style={{
        background: "var(--ink-primary)",
        color: "var(--bg-page)",
        boxShadow: "0 8px 24px rgba(0,0,0,.16)",
      }}
      role="status"
    >
      <span className="flex-none" style={{ color: "var(--accent)" }}>
        <Icon name="check" size={16} />
      </span>
      {message}
    </div>
  );
}

/** The show-and-auto-dismiss pairing every screen was re-implementing. */
export function useAdminToast(ms = 2800) {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback(
    (text: string) => {
      setMessage(text);
      window.setTimeout(() => setMessage(null), ms);
    },
    [ms],
  );
  return { message, show };
}

"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Toast — Doc1 Component 9, motion §4. Dark pill (inverse in dark mode), 13px,
 * bottom 80px (above nav), slide-up 200ms, 3s hold, optional action link.
 * Provided app-wide; call `useToast().show(...)`.
 */

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  variant?: "default" | "success" | "error";
}

interface ToastCtx {
  show: (message: string, opts?: Omit<ToastItem, "id" | "message">) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastCtx["show"]>((message, opts) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, message, ...opts }]);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {/* Toast stack, above the bottom nav (Doc1 §3 z-toast) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[80px] z-toast flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <ToastPill key={t.id} item={t} onDone={() => remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastPill({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000); // 3s hold (Doc1 §4)
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex max-w-column items-center gap-3 rounded-full px-4 py-3 shadow-l3 animate-toast-in",
        // Inverse surface: dark pill in light mode, light pill in dark mode.
        "bg-[#262626] text-white dark:bg-[#EFEFEF] dark:text-[#111]",
      )}
    >
      <span className="text-13">{item.message}</span>
      {item.action && (
        <button
          onClick={() => {
            item.action!.onClick();
            onDone();
          }}
          className="text-13 font-semibold text-[color:var(--accent)]"
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

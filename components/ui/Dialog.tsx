"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

/**
 * ConfirmDialog — Doc1 Component 37. 16px radius centred modal (max 320px):
 * title 17/600 + body 13 + button row. Destructive uses error-primary button.
 * Double-confirm variant (`typeToConfirm`) for irreversible / count-consuming
 * actions (Doc1 §11 confirmation hierarchy).
 */

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Consequence line shown above the buttons (irreversible actions). */
  consequence?: string;
  /** If set, user must type this string to enable confirm (e.g. "DELETE"). */
  typeToConfirm?: string;
  loading?: boolean;
  /** Single-action dialogs (e.g. an info popup with only "Got it"). */
  hideCancel?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  consequence,
  typeToConfirm,
  loading = false,
  hideCancel = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const confirmDisabled = !!typeToConfirm && typed.trim() !== typeToConfirm;

  return (
    <div className="fixed inset-0 z-dialog grid place-items-center p-6" role="alertdialog" aria-modal="true">
      <button aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-[color:var(--scrim-sheet)]" />
      <div className="relative w-full max-w-[320px] animate-toast-in rounded-16 bg-surface-1 p-6 shadow-l3 dark:border dark:border-border">
        <h2 className="text-17 font-semibold text-ink-primary">{title}</h2>
        {body && <div className="mt-2 text-13 text-ink-secondary">{body}</div>}
        {consequence && (
          <p className={cn("mt-3 text-13 font-medium", destructive ? "text-error" : "text-warning")}>{consequence}</p>
        )}
        {typeToConfirm && (
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`Type "${typeToConfirm}" to confirm`}
            className="mt-3 h-11 w-full rounded-8 border border-border bg-surface-2 px-3 text-15 text-ink-primary outline-none focus:border-accent"
          />
        )}
        <div className="mt-6 flex gap-3">
          {!hideCancel && (
            <Button variant="secondary" fullWidth onClick={onClose} disabled={loading}>
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={destructive ? "destructive" : "primary"}
            fullWidth
            loading={loading}
            disabled={confirmDisabled}
            onClick={() => onConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

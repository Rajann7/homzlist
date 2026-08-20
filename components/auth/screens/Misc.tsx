"use client";

import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/nav/Header";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { BrowserArt } from "@/components/auth/illustrations";

/**
 * S5 Saved Accounts (P1). "Continue as" 13/600 · rows avatar + name 15/600 +
 * masked number 13 #8E8E8E + chevron · "Use another account" 15/600 accent.
 * Masked numbers only (never full — Doc9 §17); the server always re-validates.
 */
export interface SavedAccount {
  name: string;
  phoneMasked: string;
  phone: string;
  photoUrl?: string | null;
}

export function SavedAccounts({ accounts, onPick, onUseAnother }: { accounts: SavedAccount[]; onPick: (a: SavedAccount) => void; onUseAnother: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-page px-4 md:min-h-0 md:bg-transparent md:px-0">
      <div className="mt-12 md:mt-0">
        <Wordmark className="text-24" />
      </div>
      <p className="chrome mt-8 self-start text-13 font-semibold text-ink-secondary">Continue as</p>
      <div className="mt-2 w-full">
        {accounts.map((a) => (
          <button key={a.phone} onClick={() => onPick(a)} className="flex w-full items-center gap-3 border-b border-divider py-3 text-left">
            <Avatar name={a.name} src={a.photoUrl ?? undefined} size={48} />
            <span className="flex-1">
              <span className="block text-15 font-semibold text-ink-primary">{a.name}</span>
              <span className="block text-13 text-ink-tertiary">{a.phoneMasked}</span>
            </span>
            <Icon name="chevron-right" size={20} className="text-ink-tertiary" strokeWidth={1.7} />
          </button>
        ))}
      </div>
      <button onClick={onUseAnother} className="chrome mt-6 text-15 font-semibold text-accent">
        Use another account
      </button>
    </div>
  );
}

/** S9 Browser Unsupported (P1). */
export function BrowserUnsupported() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-page px-6 text-center">
      <BrowserArt size={96} />
      <h1 className="text-20 font-bold text-ink-primary">Please update your browser</h1>
      <p className="max-w-xs text-15 text-ink-secondary">HomzList needs a modern browser to run smoothly</p>
      <div className="mt-4 flex w-full max-w-xs flex-col gap-3">
        <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer">
          <Button variant="outline" fullWidth>
            Get Chrome
          </Button>
        </a>
        <a href="https://www.microsoft.com/edge" target="_blank" rel="noreferrer">
          <Button variant="outline" fullWidth>
            Get Edge
          </Button>
        </a>
      </div>
    </div>
  );
}

/* The "coming in Batch P2 / P12" placeholder that used to live here is gone:
   "Browse as Guest" and the Terms / Privacy links now leave for the real feed
   and legal reader (see AuthFlow's `leaveTo`). */

/** Offline banner — warning strip, toggled by connectivity. */
export function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="chrome flex items-center justify-between bg-warning-soft px-4 py-2 text-13 text-warning">
      <span className="flex items-center gap-2">
        <Icon name="wifi-off" size={16} strokeWidth={1.7} /> No internet connection
      </span>
      <button onClick={onRetry} className="font-semibold">
        Retry
      </button>
    </div>
  );
}

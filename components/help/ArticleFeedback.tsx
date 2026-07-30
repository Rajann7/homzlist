"use client";

import { useState } from "react";
import { helpApi } from "@/lib/support/client";
import { useToast } from "@/components/ui/Toast";

/**
 * P12's "Was this helpful?" card. Yes/No swaps the buttons for a thank-you; No
 * additionally reveals the free-text box.
 *
 * Both branches write a real row (help_feedback) and move the article's
 * counters — the design's state change is the receipt for a persisted verdict,
 * not a local flag. `initialVerdict` is this user's existing answer, so
 * revisiting the article shows it already answered.
 */
export function ArticleFeedback({ slug, initialVerdict }: { slug: string; initialVerdict: boolean | null }) {
  const toast = useToast();
  const [verdict, setVerdict] = useState<boolean | null>(initialVerdict);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [noteSent, setNoteSent] = useState(false);

  const vote = async (helpful: boolean) => {
    setVerdict(helpful);
    const r = await helpApi.feedback(slug, helpful);
    if (!r.ok) {
      setVerdict(null);
      toast.show(r.error.code === "RATE_LIMITED" ? "Too many votes — try again later" : "Couldn't save that", {
        variant: "error",
      });
    }
  };

  const send = async () => {
    if (!note.trim() || sending) return;
    setSending(true);
    const r = await helpApi.feedback(slug, false, note.trim());
    setSending(false);
    if (r.ok) {
      setNoteSent(true);
      toast.show("Thanks for your feedback");
    } else {
      toast.show("Couldn't send that", { variant: "error" });
    }
  };

  return (
    <div className="px-4" style={{ marginTop: 16 }}>
      <div className="rounded-12 bg-surface-2 p-4 text-center">
        <p className="text-13 font-semibold text-ink-primary">Was this helpful?</p>

        {verdict === null ? (
          <div className="mt-3 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => vote(true)}
              className="chrome inline-flex h-9 min-w-[88px] items-center justify-center rounded-8 border border-border px-3 text-13 font-semibold text-ink-primary active:bg-surface-3"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => vote(false)}
              className="chrome inline-flex h-9 min-w-[88px] items-center justify-center rounded-8 border border-border px-3 text-13 font-semibold text-ink-primary active:bg-surface-3"
            >
              No
            </button>
          </div>
        ) : (
          <p className="mt-3 text-13 text-accent">Thanks for your feedback</p>
        )}

        {verdict === false && !noteSent && (
          <div className="mt-3 flex flex-col gap-3">
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="Tell us what's missing"
              className="w-full resize-none rounded-8 border border-border bg-surface-1 p-3 text-15 leading-[1.5] text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary"
            />
            <button
              type="button"
              onClick={send}
              disabled={!note.trim() || sending}
              className="chrome inline-flex h-11 w-full items-center justify-center rounded-8 bg-accent text-15 font-semibold text-white disabled:bg-accent-disabled active:bg-accent-pressed"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

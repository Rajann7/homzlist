"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { consentApi, type PendingConsent } from "@/lib/support/client";

/**
 * P12 dg-terms — the re-acceptance interstitial.
 *
 * Appears when a published legal document is flagged `requires_reacceptance` and
 * this user has no consent row for THAT version. The design gates "I agree" on
 * scrolling the preview to the end, so the button only enables once the text has
 * actually been in front of the reader — kept exactly, and the acceptance is
 * written server-side against the version the server currently publishes.
 *
 * Not dismissable: there is no close button in the design, and a consent dialog
 * you can tap past is not consent.
 */
export function ReacceptGate() {
  const toast = useToast();
  const [queue, setQueue] = useState<PendingConsent[]>([]);
  const [busy, setBusy] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const preview = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const r = await consentApi.pending();
      if (r.ok) setQueue(r.data.pending);
    })();
  }, []);

  const doc = queue[0];

  // A preview short enough not to scroll would never enable the button.
  useEffect(() => {
    const el = preview.current;
    if (!doc || !el) return;
    setScrolledToEnd(el.scrollHeight <= el.clientHeight + 8);
  }, [doc]);

  if (!doc) return null;

  const accept = async () => {
    setBusy(true);
    const r = await consentApi.accept(doc.slug);
    setBusy(false);
    if (r.ok) {
      setScrolledToEnd(false);
      setQueue((q) => q.slice(1));
      toast.show("Thanks — terms accepted");
    } else {
      toast.show("Couldn't record that — please try again", { variant: "error" });
    }
  };

  return (
    <div className="fixed inset-0 z-dialog flex items-center justify-center bg-black/50 p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reaccept-title"
        className="flex max-h-[86vh] w-full max-w-[360px] animate-[hz-pop_0.2s_cubic-bezier(0.2,0,0,1)] flex-col gap-3 overflow-y-auto rounded-16 bg-surface-1 p-6 shadow-l3"
      >
        <Icon name="file" size={32} className="text-accent" />
        <p id="reaccept-title" className="text-20 font-bold text-ink-primary">
          We&apos;ve updated our {doc.title}
        </p>
        <p className="text-15 text-ink-secondary">{doc.summary}</p>

        {doc.highlights.length > 0 && (
          <ul className="flex list-disc flex-col gap-2 pl-5 text-13 text-ink-secondary">
            {doc.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        )}

        <div
          ref={preview}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToEnd(true);
          }}
          className="h-[120px] overflow-y-auto whitespace-pre-line rounded-8 border border-border p-3 text-13 leading-[1.6] text-ink-secondary"
        >
          <b className="text-ink-primary">
            Summary of changes (v{doc.version})
          </b>
          {"\n\n"}
          {doc.preview}
          {"\n\n"}
          Scroll to the end to enable the accept button. By continuing, you accept {doc.title} v{doc.version}.
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <Link href={`/legal/${doc.slug}`} className="chrome px-2 py-2 text-15 font-semibold text-accent">
            Read full {doc.title.toLowerCase()}
          </Link>
          <button
            type="button"
            disabled={!scrolledToEnd || busy}
            onClick={accept}
            className="chrome inline-flex h-11 items-center justify-center rounded-8 bg-accent px-4 text-15 font-semibold text-white disabled:bg-accent-disabled active:bg-accent-pressed"
          >
            {busy ? "Saving…" : "I agree and continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

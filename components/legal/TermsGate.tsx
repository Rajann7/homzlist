"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, Button, useToast } from "@/components";
import { legalApi, type PendingConsent } from "@/lib/content/client";

/**
 * P12 S3e — the "We've updated our Terms" re-acceptance interstitial.
 *
 * What makes it a GATE rather than a dialog:
 *
 *  · The list of pages needing re-acceptance is computed on the SERVER
 *    (lib/legal/service.ts `pendingReacceptance`) by comparing each published
 *    page flagged `requires_reacceptance` against this user's `auth_consents`
 *    rows AT THE CURRENT VERSION. The client cannot decide it is done.
 *  · Accepting writes a consent row with the version READ FROM THE DATABASE.
 *  · There is no close button and Escape does nothing, exactly as designed —
 *    the two ways out are "Read full terms" (which opens the page in a new tab
 *    and leaves the gate standing) and "I agree and continue".
 *  · The Agree button is disabled until the extract has been scrolled to its
 *    end. That is the design's rule, and it is also the only honest basis for
 *    recording that someone was shown the change.
 *
 * More than one page can be pending; they are presented one at a time and the
 * gate only lifts when the server says the remaining count is zero.
 */
export function TermsGate({ base = "" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [queue, setQueue] = useState<PendingConsent[] | null>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await legalApi.pendingConsent();
    // A failure here must never wall a user out of the app they are logged into.
    setQueue(r.ok ? r.data.pending : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const current = queue?.[0] ?? null;

  // A new page in the queue starts its own scroll gate. If the extract is short
  // enough that there is nothing to scroll, the gate opens immediately —
  // otherwise a two-paragraph change would be unacceptable, literally.
  useEffect(() => {
    if (!current) return;
    setScrolledToEnd(false);
    const el = box.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolledToEnd(true);
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") e.stopPropagation(); };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey, true); document.body.style.overflow = prev; };
  }, [current]);

  if (!current) return null;

  async function accept() {
    if (!current || saving) return;
    setSaving(true);
    const r = await legalApi.accept(current.slug, current.version);
    setSaving(false);
    if (!r.ok) {
      toast.show(r.error.code === "OFFLINE" ? "You're offline — try again" : "Couldn't record that");
      return;
    }
    setQueue((q) => (q ?? []).slice(1));
    if (r.data.remaining === 0) {
      toast.show("Thanks — terms accepted");
      router.refresh();
    }
  }

  return (
    <div className="fixed inset-0 z-dialog flex items-center justify-center bg-black/50 p-6">
      <div className="flex max-h-[86vh] w-full max-w-[360px] flex-col gap-3 overflow-y-auto rounded-16 bg-surface-1 p-6 shadow-l3">
        <Icon name="file" size={32} className="text-accent" />
        <p className="text-20 font-bold leading-[1.25] text-ink-primary">We&apos;ve updated our {current.title}</p>
        <p className="text-15 leading-[1.45] text-ink-secondary">{current.summary}</p>

        {current.highlights.length > 0 && (
          <ul className="flex list-disc flex-col gap-2 pl-5 text-13 leading-[1.5] text-ink-secondary">
            {current.highlights.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        )}

        <div
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToEnd(true);
          }}
          className="h-[120px] overflow-y-auto rounded-8 border border-border p-3 text-13 leading-[1.6] text-ink-secondary"
        >
          <p className="mb-2 font-semibold text-ink-primary">
            Summary of changes (v{current.version})
          </p>
          <p className="whitespace-pre-line">{current.extract}</p>
          <p className="mt-3">
            By continuing, you accept {current.title} v{current.version}.
          </p>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <a
            href={`${base}/legal/${current.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="chrome px-2 text-15 font-semibold text-accent"
          >
            Read full {current.title.toLowerCase()}
          </a>
          <Button disabled={!scrolledToEnd} loading={saving} onClick={() => void accept()}>
            I agree and continue
          </Button>
        </div>

        {!scrolledToEnd && (
          <p className="text-center text-11 text-ink-tertiary">Scroll to the end to enable the button</p>
        )}
      </div>
    </div>
  );
}

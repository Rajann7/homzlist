"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Button, Skeleton } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { StillNeedHelp } from "./HelpCentre";
import { helpApi, type HelpCategoryView } from "@/lib/content/client";

/**
 * P12 S1b — the category accordion.
 *
 * The design's rows expand to a short answer and there is no "read more" — so
 * that is what this does, with the same 200ms max-height transition and the
 * chevron rotating 180°. Tapping the row title again collapses it; more than
 * one row may be open at once, exactly as in the prototype.
 */
export function HelpCategory({ slug, base = "" }: { slug: string; base?: string }) {
  const router = useRouter();
  const [view, setView] = useState<HelpCategoryView | null>(null);
  const [missing, setMissing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const r = await helpApi.category(slug);
    if (r.ok) { setView(r.data); setOffline(false); setMissing(false); }
    else if (r.error.code === "OFFLINE") setOffline(true);
    else setMissing(true);
  }, [slug]);
  useEffect(() => { void load(); }, [load]);

  const toggle = (s: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });

  const header = (
    <Header left={<BackButton fallback={`${base}/help`} />} title={view?.title ?? "Help centre"} />
  );

  if (missing) {
    return (
      <AppShell header={header}>
        <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
          <Icon name="search" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <p className="text-17 font-semibold text-ink-primary">Category not found</p>
          <Button variant="outline" className="mt-2" onClick={() => router.push(`${base}/help`)}>
            Back to Help centre
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!view) {
    return (
      <AppShell header={header}>
        {offline ? (
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
            <Icon name="wifi-off" size={48} className="text-ink-disabled" />
            <p className="text-13 text-ink-tertiary">You&apos;re offline. Reconnect to load these articles.</p>
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-px p-4">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-8" />)}
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <div className="mt-1 flex flex-col">
        {view.articles.map((a) => {
          const isOpen = open.has(a.slug);
          return (
            <div key={a.slug} className="border-b border-divider last:border-b-0">
              <button
                onClick={() => toggle(a.slug)}
                aria-expanded={isOpen}
                className="chrome flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2"
              >
                <span className="flex-1 text-15 font-semibold text-ink-primary">{a.question}</span>
                <Icon
                  name="chevron-down"
                  size={20}
                  className={`shrink-0 text-ink-tertiary transition-transform duration-200 ease-out-quart ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              <div
                className="overflow-hidden transition-[max-height] duration-200 ease-out-quart"
                style={{ maxHeight: isOpen ? 400 : 0 }}
              >
                {/* The design's accordion body is the answer paragraph and
                    nothing else — no "read more" affordance. A link was added
                    here and then removed: the design lock forbids additions, and
                    the full articles are still reachable from the popular list
                    and from search, which is how P12 reaches the article screen. */}
                <p className="px-4 pb-4 text-13 leading-[1.5] text-ink-secondary">{a.answer}</p>
              </div>
            </div>
          );
        })}
      </div>

      <StillNeedHelp onContact={() => router.push(`${base}/help/contact`)} />
      <div className="h-4" />
    </AppShell>
  );
}

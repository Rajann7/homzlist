"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Button, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { Longform } from "@/components/content/Longform";
import { ShareSheet } from "@/components/content/ShareSheet";
import { StillNeedHelp } from "./HelpCentre";
import { helpApi, type HelpArticleFull } from "@/lib/content/client";

/**
 * P12 S1c — the article reader: long-form body, related articles, the
 * "Was this helpful?" card, and the "Still need help?" card.
 *
 * The feedback card is the part worth reading twice. In the prototype Yes/No
 * just swaps some DOM. Here each vote is a row in `help_feedback`, one per
 * reader, and the aggregate on `faqs` is recomputed from those rows — which is
 * what makes the admin FAQ screen's "helpful %" a fact rather than a decoration.
 * A reader who has already voted sees their own answer instead of the buttons.
 */
export function HelpArticle({ slug, base = "" }: { slug: string; base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [article, setArticle] = useState<HelpArticleFull | null>(null);
  const [missing, setMissing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [share, setShare] = useState(false);

  const [vote, setVote] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const r = await helpApi.article(slug);
    if (r.ok) { setArticle(r.data); setVote(r.data.myVote); setOffline(false); setMissing(false); }
    else if (r.error.code === "OFFLINE") setOffline(true);
    else setMissing(true);
  }, [slug]);
  useEffect(() => { void load(); }, [load]);

  async function sendVote(helpful: boolean) {
    setVote(helpful);
    if (!helpful) setCommentOpen(true);
    const r = await helpApi.feedback(slug, helpful);
    if (!r.ok) {
      setVote(null);
      setCommentOpen(false);
      toast.show(r.error.code === "OFFLINE" ? "You're offline — try again" : "Couldn't record that");
    }
  }

  async function sendComment() {
    if (!comment.trim()) return;
    setSending(true);
    const r = await helpApi.feedback(slug, false, comment.trim());
    setSending(false);
    if (r.ok) { setCommentOpen(false); setComment(""); toast.show("Thanks for your feedback"); }
    else toast.show(r.error.code === "OFFLINE" ? "You're offline — try again" : "Couldn't send that");
  }

  const header = (
    <Header
      left={<BackButton fallback={`${base}/help`} />}
      title="Help centre"
      right={
        <button aria-label="Share" onClick={() => setShare(true)} className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2">
          <Icon name="share" size={22} />
        </button>
      }
    />
  );

  if (missing) {
    return (
      <AppShell header={header}>
        <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
          <Icon name="file" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <p className="text-17 font-semibold text-ink-primary">Article not found</p>
          <p className="text-13 text-ink-secondary">It may have been renamed or removed.</p>
          <Button variant="outline" className="mt-2" onClick={() => router.push(`${base}/help`)}>
            Back to Help centre
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!article) {
    return (
      <AppShell header={header}>
        {offline ? (
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
            <Icon name="wifi-off" size={48} className="text-ink-disabled" />
            <p className="text-13 text-ink-tertiary">You&apos;re offline. Reconnect to read this article.</p>
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-6 w-4/5 rounded-8" />
            <Skeleton className="h-3 w-2/5 rounded-8" />
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-3 w-full rounded-8" />)}
          </div>
        )}
      </AppShell>
    );
  }

  const updated = new Date(article.updatedAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <AppShell header={header}>
      <div className="px-4 pt-4">
        <h1 className="text-20 font-bold leading-[1.3] text-ink-primary">{article.question}</h1>
        <p className="mb-4 mt-1.5 text-11 text-ink-tertiary">
          Updated {updated} · {article.readMinutes} min read
        </p>
      </div>
      <Longform md={article.bodyMd} className="px-4" />

      {article.related.length > 0 && (
        <>
          <h2 className="mx-4 mb-2 mt-6 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">
            Related articles
          </h2>
          <div className="flex flex-col">
            {article.related.map((r) => (
              <button
                key={r.slug}
                onClick={() => router.push(`${base}/help/article/${r.slug}`)}
                className="chrome flex min-h-14 w-full items-center gap-3 border-b border-divider px-4 py-2 text-left last:border-b-0 active:bg-surface-2"
              >
                <Icon name="file" size={20} className="shrink-0 text-ink-tertiary" />
                <span className="flex-1 text-15 text-ink-primary">{r.question}</span>
                <Icon name="chevron-right" size={20} className="shrink-0 text-ink-tertiary" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Was this helpful? */}
      <div className="px-4 pt-4">
        <div className="rounded-12 bg-surface-2 p-4 text-center">
          <p className="text-13 font-semibold text-ink-primary">Was this helpful?</p>
          {vote === null ? (
            <div className="mt-3 flex justify-center gap-3">
              <Button variant="outline" size="small" className="min-w-[88px]" onClick={() => void sendVote(true)}>Yes</Button>
              <Button variant="outline" size="small" className="min-w-[88px]" onClick={() => void sendVote(false)}>No</Button>
            </div>
          ) : (
            <p className="mt-3 text-13 text-accent">Thanks for your feedback</p>
          )}
          {commentOpen && (
            <div className="mt-3 flex flex-col gap-3">
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 1000))}
                placeholder="Tell us what's missing"
                className="w-full resize-none rounded-8 border border-border bg-surface-1 p-3 text-15 leading-[1.5] text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary"
              />
              <Button fullWidth loading={sending} onClick={() => void sendComment()}>Send</Button>
            </div>
          )}
        </div>
      </div>

      <StillNeedHelp onContact={() => router.push(`${base}/help/contact`)} />
      <div className="h-4" />

      <ShareSheet
        open={share}
        onClose={() => setShare(false)}
        url={`/help/article/${article.slug}`}
        title={article.question}
        text="From the HomzList help centre"
      />
    </AppShell>
  );
}

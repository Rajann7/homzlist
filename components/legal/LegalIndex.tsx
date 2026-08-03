import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Header, Wordmark } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";

/**
 * P12 S3a — the Legal index. A server component: the seven rows are a query,
 * the page is public and it is one of the site's SEO surfaces, so there is no
 * reason for it to be a client component that fetches its own list.
 *
 * The guest header variant (wordmark instead of a title) is the design's
 * `.g-hdr`, shown on the public host where there is no signed-in chrome.
 */
export function LegalIndex({
  pages,
  guest = false,
  base = "",
}: {
  pages: { slug: string; title: string; icon: string; kind: string }[];
  guest?: boolean;
  base?: string;
}) {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-column bg-page">
      {guest ? (
        <Header left={<BackButton fallback="/" />} title={<Wordmark className="text-17" />} right={<span className="pr-2 text-13 font-semibold text-ink-primary">Legal</span>} />
      ) : (
        <Header left={<BackButton fallback={`${base}/settings`} />} title="Legal" />
      )}

      <div className="mt-1 flex flex-col">
        {pages.map((p) => (
          <Link
            key={p.slug}
            href={`${guest ? "" : base}/legal/${p.slug}`}
            className="flex min-h-14 items-center gap-3 border-b border-divider px-4 py-2 last:border-b-0 active:bg-surface-2"
          >
            <Icon name={p.icon as IconName} size={20} className="shrink-0 text-ink-tertiary" />
            <span className="flex-1 text-15 text-ink-primary">{p.title}</span>
            <Icon name="chevron-right" size={20} className="shrink-0 text-ink-tertiary" />
          </Link>
        ))}
      </div>

      <p className="px-4 pb-8 pt-6 text-11 leading-[1.5] text-ink-tertiary">
        The interface may be translated, but the legally binding version of every page here is the English one.
        Questions? Use{" "}
        <Link href={`${guest ? "" : base}/help`} className="text-accent">the Help centre</Link>.
      </p>
    </div>
  );
}

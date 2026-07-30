import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { AreaBlock as Block } from "@/lib/blog/area-block";

/**
 * P12 S4's accent CTA block. Three real live listings from the area the post is
 * about, then a link into the area page. Rendered on the server so the prices are
 * part of the indexable page.
 */
export function AreaBlock({ block, base = "" }: { block: Block; base?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-12 bg-accent-soft p-4">
      <p className="text-15 font-semibold text-ink-primary">Looking in {block.areaName}?</p>
      <div className="no-scrollbar flex gap-3 overflow-x-auto">
        {block.listings.map((l) => (
          <Link
            key={l.id}
            href={`${base}/property/${l.id}`}
            className="chrome flex w-[150px] shrink-0 flex-col overflow-hidden rounded-12 border border-border bg-surface-1"
          >
            {l.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.coverUrl} alt="" className="h-[84px] w-full object-cover" />
            ) : (
              <span className="flex h-[84px] items-center justify-center bg-gradient-to-br from-[#B9CCC1] to-[#7E9C8B] text-white/75">
                <Icon name="home" size={20} />
              </span>
            )}
            <span className="flex flex-col items-start gap-0.5 p-2">
              <span className="text-13 font-semibold text-ink-primary">{l.priceLabel}</span>
              <span className="text-11 text-ink-tertiary">{l.subtitle}</span>
            </span>
          </Link>
        ))}
      </div>
      <Link href={`${base}/area/${block.areaSlug}-${block.citySlug}`} className="text-13 font-semibold text-accent">
        See all listings in {block.areaName} →
      </Link>
    </div>
  );
}

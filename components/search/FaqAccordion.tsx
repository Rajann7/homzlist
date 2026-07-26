"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Faq } from "@/lib/seo/content";
import { cn } from "@/lib/utils";

/**
 * FAQ accordions on the area/landing page (designs/P3 S4).
 *
 * The ANSWERS are always in the DOM (hidden with CSS, not unmounted) so a
 * crawler reads them and the FAQPage schema on the page is not contradicted by
 * markup that only appears after a click.
 */
export function FaqAccordion({ faqs }: { faqs: Faq[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});

  return (
    <>
      {faqs.map((f, i) => (
        <div key={i} className={cn(i < faqs.length - 1 && "border-b border-divider")}>
          <button
            onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
            aria-expanded={Boolean(open[i])}
            className="flex w-full items-center gap-2.5 p-3.5 text-left"
          >
            <span className="flex-1 text-15 font-semibold leading-[1.35] text-ink-primary">{f.question}</span>
            <Icon
              name="chevron-down"
              size={18}
              strokeWidth={2}
              className={cn("shrink-0 text-ink-secondary transition-transform duration-200", open[i] && "rotate-180")}
            />
          </button>
          <div className={cn("px-3.5 pb-3.5 text-13 leading-[1.5] text-ink-secondary", !open[i] && "hidden")}>
            {f.answer}
          </div>
        </div>
      ))}
    </>
  );
}

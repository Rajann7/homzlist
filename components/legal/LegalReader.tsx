"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/nav/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LegalHeader } from "./LegalHeader";
import { ShareSheet } from "@/components/help/ShareSheet";
import { Callout } from "@/components/help/primitives";
import { cn } from "@/lib/utils";

/**
 * P12 S3 — the legal reader (Terms / Privacy / Refund / Disclaimer / Community /
 * Cookie / About).
 *
 * Layout is the design's exactly: version strip with "View previous versions",
 * a collapsible Table of contents card, the long-form body, then Download PDF +
 * Share. The body arrives pre-rendered from the server (SSR, so it is indexable
 * and readable with JS off); only the TOC toggle, the smooth-scroll and the share
 * sheet are client behaviour.
 */
export interface LegalReaderProps {
  slug: string;
  title: string;
  version: string;
  effectiveDateLabel: string;
  updatedLabel: string;
  versionCount: number;
  sections: Array<{ id: string; title: string }>;
  guest: boolean;
  shareUrl: string;
  /** Server-rendered long-form body. */
  children: React.ReactNode;
  /** Shown above the body — the grievance page's officer card. */
  intro?: React.ReactNode;
}

export function LegalReader({
  slug,
  title,
  version,
  effectiveDateLabel,
  updatedLabel,
  versionCount,
  sections,
  guest,
  shareUrl,
  children,
  intro,
}: LegalReaderProps) {
  const [tocOpen, setTocOpen] = useState(false);
  const [share, setShare] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState("0px");

  useEffect(() => {
    if (!body.current) return;
    setMax(tocOpen ? `${body.current.scrollHeight}px` : "0px");
  }, [tocOpen]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <AppShell header={<LegalHeader title={title} guest={guest} />} showNav={!guest}>
      <div className="px-4" style={{ marginTop: 12 }}>
        <div className="flex items-center gap-2 rounded-8 bg-surface-2 px-3 py-2.5 text-11 text-ink-tertiary">
          <span>
            Version {version}
            {effectiveDateLabel ? ` · Effective ${effectiveDateLabel}` : ""}
          </span>
          <span className="flex-1" />
          {versionCount > 1 && (
            <Link href={`/legal/${slug}/versions`} className="chrome text-accent">
              View previous versions
            </Link>
          )}
        </div>

        {sections.length > 1 && (
          <div className="mt-3 overflow-hidden rounded-12 border border-border bg-surface-1">
            <button
              type="button"
              onClick={() => setTocOpen((v) => !v)}
              aria-expanded={tocOpen}
              className="chrome flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2"
            >
              <span className="flex-1 text-13 font-semibold text-ink-primary">Table of contents</span>
              <Icon
                name="chevron-down"
                size={20}
                className={cn("text-ink-tertiary transition-transform duration-200 ease-out-quart", tocOpen && "rotate-180")}
              />
            </button>
            <div
              ref={body}
              style={{ maxHeight: max }}
              className="overflow-hidden transition-[max-height] duration-200 ease-out-quart"
            >
              <div className="flex flex-col gap-2 px-4 pb-4 text-13">
                {/* No index is prefixed here: the documents number their own
                    headings ("1. Who we are"), so adding one read "1. 1. …". */}
                {sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => jump(s.id)}
                    className="chrome text-left text-accent"
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {intro}

      <div className="p-4 text-15 leading-[1.6] text-ink-primary">
        {children}

        <p className="mt-6 text-11 text-ink-tertiary">Last updated {updatedLabel}</p>
        <div className="mt-3 flex items-center gap-3">
          <a
            href={`/api/v1/cms/pages/${slug}/pdf`}
            className="chrome inline-flex h-9 items-center gap-2 rounded-8 border border-border px-3 text-13 font-semibold text-ink-primary active:bg-surface-2"
          >
            <Icon name="download" size={16} />
            Download PDF
          </a>
          <button
            type="button"
            onClick={() => setShare(true)}
            className="chrome inline-flex h-9 items-center gap-2 rounded-8 border border-border px-3 text-13 font-semibold text-ink-primary active:bg-surface-2"
          >
            <Icon name="share" size={16} />
            Share
          </button>
        </div>
      </div>

      <ShareSheet open={share} onClose={() => setShare(false)} url={shareUrl} title={title} />
    </AppShell>
  );
}

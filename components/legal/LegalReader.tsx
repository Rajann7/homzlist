"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, Button, BottomSheet, useToast } from "@/components";
import { Header, Wordmark } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { Longform, tocOf } from "@/components/content/Longform";
import { ShareSheet } from "@/components/content/ShareSheet";
import { legalApi, type LegalVersion } from "@/lib/content/client";

/**
 * P12 S3 — the legal reader.
 *
 * The design gives every legal page the same furniture: a version bar with
 * "View previous versions", a collapsible Table of contents that jumps to a
 * section, the long-form body, "Last updated", and Download PDF + Share.
 *
 * Two notes on fidelity:
 *  · The header has a GUEST variant (wordmark + page name on the right) and a
 *    signed-in variant (back + title). The design draws both; `guest` picks.
 *  · The TOC is built from the body's own `##` headings, so an admin editing
 *    the page in the CMS gets a correct contents list without maintaining one.
 *
 * "Download PDF" prints. The browser's print-to-PDF is a real PDF of the real
 * page; shipping a button that toasts "coming soon" on a legal page a user may
 * need to keep a copy of is not something to leave for later.
 */

export interface LegalPageProps {
  page: {
    slug: string;
    title: string;
    bodyMd: string;
    version: string;
    effectiveDate: string | null;
    updatedAt: string;
    reader: "longform" | "grievance";
    versionCount: number;
    isArchivedVersion?: boolean;
  };
  officer: {
    name: string;
    designation: string;
    email: string;
    address: string;
    phone: string | null;
    hours: string;
  } | null;
  guest?: boolean;
  base?: string;
}

export function LegalReader({ page, officer, guest = false, base = "" }: LegalPageProps) {
  const router = useRouter();
  const toast = useToast();
  const [tocOpen, setTocOpen] = useState(false);
  const [share, setShare] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<LegalVersion[] | null>(null);

  const toc = tocOf(page.bodyMd);

  const loadVersions = useCallback(async () => {
    const r = await legalApi.versions(page.slug);
    setVersions(r.ok ? r.data.versions : []);
  }, [page.slug]);

  useEffect(() => { if (versionsOpen && !versions) void loadVersions(); }, [versionsOpen, versions, loadVersions]);

  const jump = (id: string) => {
    setTocOpen(false);
    // The header is sticky at 56px; the design lands the heading just below it.
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  const effective = page.effectiveDate
    ? new Date(page.effectiveDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const updated = new Date(page.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-column bg-page">
      {guest ? (
        <Header
          left={<BackButton fallback="/" />}
          right={<span className="pr-2 text-13 font-semibold text-ink-primary">{page.title}</span>}
          title={<Wordmark className="text-17" />}
        />
      ) : (
        <Header left={<BackButton fallback={`${base}/legal`} />} title={page.title} />
      )}

      {/* version bar */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 rounded-8 bg-surface-2 px-3 py-2.5 text-11 text-ink-tertiary">
          <span>
            Version {page.version}
            {effective ? ` · Effective ${effective}` : ""}
          </span>
          <span className="flex-1" />
          {page.versionCount > 1 && (
            <button className="chrome text-accent" onClick={() => setVersionsOpen(true)}>
              View previous versions
            </button>
          )}
        </div>

        {page.isArchivedVersion && (
          <div className="mt-3 flex items-start gap-2.5 rounded-8 bg-warning-soft p-3 text-13 leading-[1.5] text-ink-primary">
            <Icon name="alert" size={18} className="mt-px shrink-0 text-warning" />
            <span>
              You&apos;re reading an archived version.{" "}
              <Link href={`${guest ? "" : base}/legal/${page.slug}`} className="font-semibold text-accent">
                Read the current version
              </Link>
              .
            </span>
          </div>
        )}

        {/* Table of contents */}
        {toc.length > 1 && (
          <div className="mt-3 overflow-hidden rounded-12 border border-border">
            <button
              onClick={() => setTocOpen((v) => !v)}
              aria-expanded={tocOpen}
              className="chrome flex min-h-12 w-full items-center gap-3 px-4 text-left active:bg-surface-2"
            >
              <span className="flex-1 text-13 font-semibold text-ink-primary">Table of contents</span>
              <Icon
                name="chevron-down"
                size={20}
                className={`text-ink-tertiary transition-transform duration-200 ease-out-quart ${tocOpen ? "rotate-180" : ""}`}
              />
            </button>
            <div
              className="overflow-hidden transition-[max-height] duration-200 ease-out-quart"
              style={{ maxHeight: tocOpen ? toc.length * 30 + 32 : 0 }}
            >
              <div className="flex flex-col gap-2 px-4 pb-4 text-13">
                {toc.map((t) => (
                  <button key={t.id} onClick={() => jump(t.id)} className="chrome text-left text-accent">
                    {t.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The grievance reader's officer card sits above the body (design S3d). */}
      {page.reader === "grievance" && officer && (
        <div className="px-4 pt-4">
          <div className="flex flex-col gap-2 rounded-12 bg-surface-2 p-4">
            <Icon name="shield" size={32} className="text-accent" />
            <p className="text-15 font-semibold text-ink-primary">Grievance Officer</p>
            <p className="text-13 text-ink-primary">Name: {officer.name}</p>
            <p className="text-13 text-ink-primary">{officer.designation}</p>
            <p className="flex items-center gap-1.5 text-13 text-ink-primary">
              Email:{" "}
              <a href={`mailto:${officer.email}`} className="text-accent">{officer.email}</a>
              <button
                aria-label="Copy email"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(officer.email); toast.show("Copied to clipboard"); }
                  catch { toast.show("Couldn't copy"); }
                }}
                className="chrome grid h-7 w-7 place-items-center rounded-full text-ink-tertiary active:bg-surface-3"
              >
                <Icon name="copy" size={16} />
              </button>
            </p>
            <p className="text-13 text-ink-primary">Address: {officer.address}</p>
            {officer.phone && <p className="text-13 text-ink-primary">Phone: {officer.phone}</p>}
            <p className="text-13 text-ink-primary">Hours: {officer.hours}</p>
            <p className="text-13 text-ink-secondary">
              We acknowledge complaints within 24 hours and resolve them within 15 days.
            </p>
            <Button
              className="mt-2 self-start"
              onClick={() => router.push(guest ? "/login?next=/help/contact%3Ftopic%3Dgrievance" : `${base}/help/contact?topic=grievance`)}
            >
              Raise a grievance
            </Button>
          </div>
        </div>
      )}

      <Longform md={page.bodyMd} className="px-4 pt-2" />

      <div className="px-4 pb-8">
        <p className="mt-6 text-11 text-ink-tertiary">Last updated {updated}</p>
        <div className="mt-3 flex gap-3">
          <Button variant="outline" size="small" onClick={() => window.print()}>
            <Icon name="download" size={16} />
            Download PDF
          </Button>
          <Button variant="outline" size="small" onClick={() => setShare(true)}>
            <Icon name="share" size={16} />
            Share
          </Button>
        </div>
        <p className="mt-6 text-11 leading-[1.5] text-ink-tertiary">
          <Link href={guest ? "/legal/terms" : `${base}/legal/terms`} className="text-ink-tertiary">Terms</Link> ·{" "}
          <Link href={guest ? "/legal/privacy" : `${base}/legal/privacy`} className="text-ink-tertiary">Privacy</Link> ·{" "}
          <Link href={guest ? "/legal/refund" : `${base}/legal/refund`} className="text-ink-tertiary">Refunds</Link> ·{" "}
          <Link href={guest ? "/legal/grievance" : `${base}/legal/grievance`} className="text-ink-tertiary">Grievance</Link>{" "}
          · © {new Date().getFullYear()} HomzList, Rajkot
        </p>
      </div>

      <BottomSheet open={versionsOpen} onClose={() => setVersionsOpen(false)} title="Previous versions">
        <div className="flex flex-col pb-2">
          {versions === null ? (
            <p className="px-4 py-6 text-center text-13 text-ink-tertiary">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="px-4 py-6 text-center text-13 text-ink-tertiary">No archived versions yet.</p>
          ) : (
            versions.map((v) => (
              <Link
                key={v.version}
                href={`${guest ? "" : base}/legal/${page.slug}${v.isCurrent ? "" : `?version=${encodeURIComponent(v.version)}`}`}
                onClick={() => setVersionsOpen(false)}
                className="flex min-h-14 items-center gap-3 border-b border-divider px-4 py-2 last:border-b-0 active:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-15 text-ink-primary">
                    Version {v.version}
                    {v.isCurrent && <span className="ml-2 text-11 font-semibold uppercase text-accent">Current</span>}
                  </p>
                  <p className="truncate text-11 text-ink-tertiary">
                    {v.effectiveDate
                      ? new Date(v.effectiveDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      : new Date(v.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {v.note ? ` · ${v.note}` : ""}
                  </p>
                </div>
                <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
              </Link>
            ))
          )}
        </div>
      </BottomSheet>

      <ShareSheet
        open={share}
        onClose={() => setShare(false)}
        url={`/legal/${page.slug}`}
        title={`${page.title} — HomzList`}
      />
    </div>
  );
}

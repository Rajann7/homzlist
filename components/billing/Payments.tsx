"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, Chip, EmptyState, Header, Icon, Skeleton, Spinner, Wordmark, useToast } from "./ui";
import { billingApi, type PaymentRow } from "@/lib/billing/client";
import { BackButton, OfflineBanner, SectionLabel, SheetOption } from "./primitives";

/**
 * P11 S3 — Payment history & invoices.
 *
 * The list is whatever `/billing/payments` returns for the SESSION user; there
 * is no user id in the request, so there is nothing to tamper with. Invoices are
 * fetched by id and the server re-checks ownership on each (Doc9 §API1 IDOR).
 */

const STATUS_STYLE: Record<string, string> = {
  success: "bg-accent-soft text-accent",
  pending: "bg-info-soft text-info",
  failed: "bg-error-soft text-error",
  refunded: "bg-surface-2 text-ink-secondary",
  chargeback: "bg-error-soft text-error",
};

export function Payments() {
  const router = useRouter();
  const toast = useToast();

  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [summary, setSummary] = useState<{ totalSpent: string; transactions: number } | null>(null);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<{ status?: string; range?: string }>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await billingApi.payments(filter);
    if (res.ok) {
      setRows(res.data.items);
      setSummary(res.data.summary);
      setOffline(false);
    } else {
      setOffline(res.error.code === "OFFLINE");
      setRows([]);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  /** "Check status" on a pending row → the server re-polls Razorpay for us. */
  const checkStatus = async (row: PaymentRow) => {
    setChecking(row.id);
    const res = await billingApi.verify({ orderId: row.orderId });
    setChecking(null);
    if (res.ok && res.data.status === "success") {
      toast.show("Payment confirmed");
      void load();
    } else {
      toast.show("Still processing — we'll notify you");
    }
  };

  let body: React.ReactNode;

  if (!rows) {
    body = <PaymentsSkeleton />;
  } else if (!rows.length && !offline) {
    body = (
      <EmptyState
        className="pt-10"
        title="No payments yet"
        subtitle="Your plan purchases and invoices appear here"
        illustration={<Icon name="receipt" size={96} className="text-ink-disabled" />}
        cta={{ label: "View Plans", onClick: () => router.push("/plans") }}
      />
    );
  } else {
    body = (
      <>
        {offline && <OfflineBanner />}
        <div className="flex flex-col gap-3 p-4">
          {summary && (
            <div className="rounded-12 bg-surface-2 p-4">
              <div className="flex text-center">
                <div className="flex-1">
                  <div className="text-17 font-bold text-ink-primary">{summary.totalSpent}</div>
                  <div className="text-11 text-ink-tertiary">Total spent</div>
                </div>
                <div className="flex-1">
                  <div className="text-17 font-bold text-ink-primary">{summary.transactions}</div>
                  <div className="text-11 text-ink-tertiary">Transactions</div>
                </div>
              </div>
            </div>
          )}

          {rows.map((r) => (
            <div key={r.id} className="rounded-12 bg-surface-1 p-3 shadow-l1 dark:border dark:border-border dark:shadow-none">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-15 font-semibold text-ink-primary">{r.title}</span>
                {r.status === "success" ? (
                  <span className="shrink-0 text-15 font-semibold text-ink-primary">{r.amount}</span>
                ) : (
                  <span className={`chrome shrink-0 rounded-4 px-1.5 py-0.5 text-11 font-semibold uppercase tracking-[0.3px] ${STATUS_STYLE[r.status]}`}>
                    {r.statusLabel}
                  </span>
                )}
              </div>

              {r.status === "success" && (
                <>
                  <div className="mb-2 mt-1.5 text-11 text-ink-tertiary">{r.when}{r.method ? ` · ${r.method}` : ""}</div>
                  <span className={`chrome inline-flex rounded-4 px-1.5 py-0.5 text-11 font-semibold uppercase tracking-[0.3px] ${STATUS_STYLE.success}`}>Success</span>
                  <div className="my-3 h-px bg-divider" />
                  <div className="flex gap-5">
                    {r.invoiceId && (
                      <button onClick={() => setInvoiceId(r.invoiceId)} className="tap44 text-13 font-semibold text-accent">View invoice</button>
                    )}
                    <button onClick={() => setDetailId(r.id)} className="tap44 text-13 font-semibold text-accent">Details</button>
                  </div>
                </>
              )}

              {r.status === "pending" && (
                <>
                  <div className="my-2 flex items-center gap-1.5 text-11 text-ink-tertiary">
                    <Spinner size={14} className="text-info" />
                    {r.when} · {r.method ?? "UPI"} · waiting for confirmation
                  </div>
                  <p className="mb-2.5 text-11 leading-[1.45] text-ink-tertiary">
                    Don&apos;t pay again — this can take up to 10 minutes.
                  </p>
                  <Button variant="outline" size="small" loading={checking === r.id} onClick={() => void checkStatus(r)}>
                    Check status
                  </Button>
                </>
              )}

              {r.status === "failed" && (
                <>
                  <div className="mb-1.5 mt-2 text-11 text-ink-tertiary">{r.failureReason ?? "Payment failed"} · {r.when}</div>
                  <p className="mb-2.5 text-11 leading-[1.45] text-ink-tertiary">
                    No money was deducted. If it was, it&apos;s refunded automatically in 5–7 days.
                  </p>
                  <div className="flex items-center gap-4">
                    <Button size="small" disabled={!r.catalogCode} onClick={() => router.push(`/checkout?plan=${r.catalogCode}`)}>
                      Retry payment
                    </Button>
                    <button onClick={() => toast.show("Support opens in the settings module")} className="text-13 font-semibold text-accent">
                      Contact support
                    </button>
                  </div>
                </>
              )}

              {(r.status === "refunded" || r.status === "chargeback") && (
                <>
                  <div className="mb-1 mt-2 text-11 text-ink-tertiary">
                    Refunded on {r.refundedOn}{r.refundReason ? ` · reason: ${r.refundReason}` : ""}
                  </div>
                  <div className="mb-2.5 text-11 text-accent">{r.amount} credited to your account in 5–7 days</div>
                  {r.invoiceId && (
                    <button onClick={() => setInvoiceId(r.invoiceId)} className="tap44 text-13 font-semibold text-accent">View invoice</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <AppShell
      showNav={false}
      header={
        <Header
          left={<BackButton fallback="/plans" />}
          title="Payments"
          centerTitle
          right={
            <>
              <Button variant="icon" aria-label="Filter payments" onClick={() => setFilterOpen(true)}><Icon name="filter" /></Button>
              <Button variant="icon" aria-label="More options" onClick={() => setMenuOpen(true)}><Icon name="more" /></Button>
            </>
          }
        />
      }
    >
      {body}

      <InvoiceSheet id={invoiceId} onClose={() => setInvoiceId(null)} />
      <DetailsSheet id={detailId} onClose={() => setDetailId(null)} />

      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter payments">
        <div className="flex flex-col gap-4 pb-2">
          <SectionLabel>Status</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {([["", "All"], ["success", "Successful"], ["pending", "Pending"], ["failed", "Failed"], ["refunded", "Refunded"]] as const).map(([k, label]) => (
              <Chip key={label} selected={(filter.status ?? "") === k} onClick={() => { setFilter((f) => ({ ...f, status: k || undefined })); setFilterOpen(false); }}>
                {label}
              </Chip>
            ))}
          </div>
          <SectionLabel>Date range</SectionLabel>
          <div>
            {([["30d", "Last 30 days"], ["6m", "Last 6 months"], ["fy", "This financial year"], ["all", "All time"]] as const).map(([k, label]) => (
              <SheetOption key={k} label={label} onClick={() => { setFilter((f) => ({ ...f, range: k })); setFilterOpen(false); }} />
            ))}
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Options">
        <SheetOption label="Download all invoices (ZIP)" icon={<Icon name="download" size={20} />} onClick={() => { setMenuOpen(false); toast.show("Preparing ZIP…"); }} />
        <SheetOption label="Email invoices to me" icon={<Icon name="mail" size={20} />} onClick={() => { setMenuOpen(false); toast.show("Invoices emailed"); }} />
      </BottomSheet>
    </AppShell>
  );
}

/* ---- Invoice sheet (print-clean, GST line items) ------------------------- */

export function InvoiceSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const toast = useToast();
  const [inv, setInv] = useState<any>(null);
  const [emailing, setEmailing] = useState(false);

  useEffect(() => {
    if (!id) { setInv(null); return; }
    void billingApi.invoice(id).then((r) => setInv(r.ok ? r.data.invoice : null));
  }, [id]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show("Payment ID copied");
    } catch {
      toast.show("Couldn't copy");
    }
  };

  return (
    <BottomSheet open={!!id} onClose={onClose} title="Invoice" className="h-[90dvh]">
      {!inv ? (
        <Skeleton className="h-64 w-full rounded-12" />
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          <div className="rounded-12 border border-border bg-surface-1 p-4 text-13">
            <div className="flex items-start justify-between">
              <Wordmark />
              <span className="text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Tax Invoice</span>
            </div>
            <div className="mt-3 text-13 font-semibold text-ink-primary">Invoice #{inv.number}</div>
            <div className="text-11 text-ink-tertiary">Date: {inv.date}</div>
            <div className="my-3 h-px bg-divider" />
            <div className="text-11 text-ink-tertiary">Billed to</div>
            <div className="text-13 text-ink-primary">{inv.billedTo?.name} · {inv.billedTo?.phone}</div>
            {inv.gstin && <div className="text-11 text-ink-tertiary">GSTIN: {inv.gstin}</div>}
            <div className="my-3 h-px bg-divider" />
            {/* Index key, not `li.title`: line items come straight from the
                invoice's `line_items` jsonb, where two rows may legitimately
                carry the same title (two identical plans on one order). No
                invoice in the DB does today, but it is the same collision that
                broke My Plan's trace — and an invoice is never reordered. */}
            {inv.lineItems.map((li: any, liIdx: number) => (
              <div key={liIdx}>
                <div className="flex justify-between py-1">
                  <span className="text-ink-primary">{li.title}</span>
                  <span className="text-ink-primary">{li.amount}</span>
                </div>
                <div className="text-11 leading-[1.4] text-ink-tertiary">{li.contents}</div>
              </div>
            ))}
            <div className="my-3 h-px bg-divider" />
            <InvRow k="Subtotal" v={inv.totals.subtotal} />
            {inv.totals.discount && <InvRow k={`Coupon ${inv.totals.couponCode ?? ""}`} v={inv.totals.discount} accent />}
            <InvRow k="Taxable" v={inv.totals.taxable} />
            {inv.totals.cgst && <InvRow k="CGST 9%" v={inv.totals.cgst} />}
            {inv.totals.sgst && <InvRow k="SGST 9%" v={inv.totals.sgst} />}
            {inv.totals.igst && <InvRow k="IGST 18%" v={inv.totals.igst} />}
            <div className="my-2 h-px bg-divider" />
            <div className="flex justify-between pt-2 text-17 font-semibold text-ink-primary">
              <span>Total paid</span>
              <span>{inv.totals.total}</span>
            </div>
            <div className="my-3 h-px bg-divider" />
            {inv.paymentRef && (
              <div className="flex items-center gap-1.5 text-11 text-ink-tertiary">
                Payment ID: {inv.paymentRef}
                <button onClick={() => void copy(inv.paymentRef)} aria-label="Copy payment ID" className="grid h-7 w-7 place-items-center">
                  <Icon name="copy" size={16} />
                </button>
              </div>
            )}
            {inv.method && <div className="text-11 text-ink-tertiary">Method: {inv.method}</div>}
            <p className="mt-2.5 text-11 leading-[1.45] text-ink-tertiary">
              HomzList · Rajkot, Gujarat · This is a computer-generated invoice.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => window.print()}>
              <Icon name="download" size={18} /> Download PDF
            </Button>
            <Button
              variant="outline"
              fullWidth
              loading={emailing}
              onClick={async () => {
                setEmailing(true);
                const r = await billingApi.emailInvoice(inv.id);
                setEmailing(false);
                toast.show(r.ok ? "Invoice emailed" : "Couldn't email right now");
              }}
            >
              <Icon name="mail" size={18} /> Email to me
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function InvRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between py-1">
      <span className={accent ? "text-accent" : "text-ink-secondary"}>{k}</span>
      <span className={accent ? "text-accent" : "text-ink-primary"}>{v}</span>
    </div>
  );
}

/* ---- Payment details sheet ---------------------------------------------- */

export function DetailsSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Record<string, string | null> | null>(null);

  useEffect(() => {
    if (!id) { setD(null); return; }
    void billingApi.paymentDetail(id).then((r) => setD(r.ok ? r.data.payment : null));
  }, [id]);

  const rows: [string, string, boolean][] = d
    ? [
        ["Order ID", d.orderId ?? "—", false],
        ["Payment ID", d.paymentId ?? "—", true],
        ["Method", d.method ?? "—", false],
        ["Status", d.status ?? "—", false],
        ["Plan contents", d.planContents ?? "—", false],
        ["Coupon", d.coupon ?? "—", false],
        ["Refund status", d.refundStatus ?? "—", false],
      ]
    : [];

  return (
    <BottomSheet open={!!id} onClose={onClose} title="Payment details">
      {!d ? (
        <Skeleton className="h-56 w-full rounded-12" />
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          <div className="rounded-12 border border-border bg-surface-1 px-4 py-1">
            {rows.map(([k, v, copyable], i) => (
              <div key={k} className={`flex items-center gap-3 py-3.5 ${i < rows.length - 1 ? "border-b border-divider" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-11 text-ink-tertiary">{k}</div>
                  <div className="mt-0.5 break-all text-13 text-ink-primary">{v}</div>
                </div>
                {copyable && (
                  <button
                    aria-label="Copy payment ID"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(v);
                        toast.show("Payment ID copied");
                      } catch {
                        toast.show("Couldn't copy");
                      }
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center text-ink-tertiary"
                  >
                    <Icon name="copy" size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => { onClose(); toast.show("Support opens in the settings module"); }} className="tap44 self-start text-13 font-semibold text-error">
            Report a problem with this payment
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

function PaymentsSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton className="h-14 w-full rounded-12" />
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-12" />)}
    </div>
  );
}

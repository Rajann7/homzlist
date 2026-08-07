"use client";

/**
 * A4 — Review detail. Template 675-808, plus the four overlays it opens
 * (approve 1530, reject 1536, request-changes 1548, more 1634).
 *
 * The left pane is the REAL feed card off the real preview builder, because the
 * screen says "This is exactly what users will see" and that has to be
 * structurally true rather than a claim.
 *
 * Three things the design draws that only work with a server behind them, and
 * all three do here: the lock banner names whoever holds the item and offers
 * "Skip to next"; the keyboard shortcuts printed in the top bar (A/R/→) are
 * bound; and every action auto-advances to the next item in the queue the way
 * the prototype's `reviewIdx + 1` does.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminIcon,
  Badge,
  Btn,
  Chip,
  Modal,
  RightSheet,
  RiskBadge,
  Avatar,
  Thumb,
  SheetMenu,
  useToast,
  SCREEN_ROUTES,
} from "@/components/admin/ds";
import { FeedCard } from "@/components/feed/FeedCard";
import type { ReviewPayload } from "@/lib/admin/review";
import type { LockState } from "@/lib/admin/review-lock";

/** template 1537 — the reject reasons, and the one that opens a free-text box. */
const REJECT_REASONS = [
  "Duplicate listing",
  "Fake or misleading",
  "Photos don't match the property",
  "Price is unrealistic",
  "Wrong category or type",
  "Contact details in content",
  "Prohibited content",
  "Other",
];

/** template 1549-1551 — the change-request chips and their starting text. */
const CHANGE_TEMPLATES: Record<string, string> = {
  Photos: "Photos are too dark — please re-upload daylight photos.",
  Price: "Price seems unusually low for this area — please confirm.",
  Title: "Title doesn't match the property type.",
  Description: "Please remove contact numbers from the description.",
  Location: "Location is incomplete — add the area and pincode.",
  Contact: "Please verify the display number.",
};

const SOP = [
  "Photos show the actual property (not screenshots or brochures)",
  "Price is plausible for the area",
  "Title and description match the type",
  "Location is complete (area + pincode)",
  "No phone numbers or links in text",
  "Co-ownership / POA is acceptable",
  "Multiple brokers listing the same property is allowed",
];

type Overlay = "approve" | "reject" | "changes" | "more" | null;

export function ReviewDetail({
  data,
  lock,
  backTab,
}: {
  data: ReviewPayload;
  lock: LockState;
  backTab: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [tab, setTab] = useState<"card" | "full">("card");
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [changeChips, setChangeChips] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sop, setSop] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  const readOnly = !lock.mine;
  const queueHref = `${SCREEN_ROUTES.listings}?tab=${backTab}`;

  /* ---- the lock: heartbeat while open, release on close ------------------ */
  useEffect(() => {
    if (!lock.mine) return;
    const beat = () =>
      fetch("/api/v1/admin/review/lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ subject: "listing", id: data.id }),
      }).catch(() => {});

    // Re-assert on mount. The page claims the lock while it RENDERS, and the
    // cleanup below releases it on unmount — so any remount of the same
    // listing (React's double-invoked effects in dev, a re-render after a
    // refresh) can order itself claim → mount → release → mount and leave the
    // item unlocked while it is open on screen. Claiming again is the same
    // idempotent statement for the holder, so this closes that window.
    beat();

    const timer = setInterval(beat, 4 * 60_000);
    const release = () => {
      // A beacon is the only request that survives the tab closing.
      navigator.sendBeacon?.(
        "/api/v1/admin/review/lock/release",
        new Blob([JSON.stringify({ subject: "listing", id: data.id })], {
          type: "application/json",
        }),
      );
    };
    window.addEventListener("pagehide", release);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", release);
    };
    // NOTE: unmount does NOT release. The page claims the lock while it renders
    // on the server, and React does not guarantee that the old instance
    // unmounts before the new one mounts — so a release-on-unmount raced the
    // fresh claim and left the listing unlocked while it was open on screen
    // (reproduced: the row vanished from review_locks two seconds after the
    // screen loaded). Releasing happens where LEAVING actually happens —
    // `leave()` below, the decision endpoint, and the pagehide beacon — with
    // the 10-minute TTL as the backstop for everything else.
  }, [data.id, lock.mine]);

  /** Give the lock back, then go. Used by ×, Skip and the next/prev arrows. */
  const leave = useCallback(
    (href: string) => {
      if (lock.mine) {
        fetch("/api/v1/admin/review/lock", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ subject: "listing", id: data.id }),
          keepalive: true,
        }).catch(() => {});
      }
      router.push(href);
    },
    [data.id, lock.mine, router],
  );

  const goNext = useCallback(() => {
    leave(
      data.nextId ? `${SCREEN_ROUTES.listings}/${data.nextId}?tab=${backTab}` : queueHref,
    );
  }, [data.nextId, leave, backTab, queueHref]);

  /* ---- the decisions ----------------------------------------------------- */
  const decide = useCallback(
    async (body: Record<string, unknown>, done: string) => {
      if (busy) return;
      setBusy(true);
      const res = await fetch(`/api/v1/admin/queues/listings/${data.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok: boolean; data?: { locked?: boolean }; error?: { code: string; message?: string } }
        | null;
      setBusy(false);
      setOverlay(null);

      if (!json?.ok) {
        // The server knows WHY it refused and what to do about it — a listing
        // already decided, or locked after three rejections, are different
        // situations with different remedies. Guessing "someone else already
        // decided this one" for both was wrong whenever the someone was you.
        toast(json?.error?.message ?? "That didn't go through — try again");
        return;
      }
      toast(json.data?.locked ? `${done} · listing is now locked` : `${done} · next in queue`);
      goNext();
    },
    [busy, data.id, goNext, toast],
  );

  /* ---- template 689 — "A approve · R reject · → next", actually bound ---- */
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (overlay) return;
      if (e.key === "a" || e.key === "A") setOverlay("approve");
      else if (e.key === "r" || e.key === "R") setOverlay("reject");
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft" && data.prevId) {
        leave(`${SCREEN_ROUTES.listings}/${data.prevId}?tab=${backTab}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, readOnly, goNext, data.prevId, leave, backTab]);

  const iconBtn = (name: "chevL" | "chevR" | "x", onClick: () => void, disabled?: boolean) => (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--s1)",
        color: disabled ? "var(--inkDis)" : "var(--ink2)",
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AdminIcon name={name} size={18} />
    </button>
  );

  return (
    <div>
      {/* ---- top bar (template 684-691) ---- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink1)" }}>
          {`Review #${data.id.slice(0, 8)}`}
        </div>
        <span style={{ fontSize: 13, color: "var(--ink3)" }}>
          {`${data.position.index} of ${data.position.total}`}
        </span>
        {iconBtn(
          "chevL",
          () => leave(`${SCREEN_ROUTES.listings}/${data.prevId}?tab=${backTab}`),
          !data.prevId,
        )}
        {iconBtn(
          "chevR",
          () => leave(`${SCREEN_ROUTES.listings}/${data.nextId}?tab=${backTab}`),
          !data.nextId,
        )}
        <span
          style={{
            fontSize: 11,
            color: "var(--ink3)",
            background: "var(--s2)",
            padding: "5px 8px",
            borderRadius: 6,
            fontFamily: "ui-monospace,monospace",
          }}
        >
          A approve · R reject · → next
        </span>
        <div style={{ flex: 1 }} />
        {iconBtn("x", () => leave(queueHref))}
      </div>

      {/* ---- lock banner (template 693-696) ---- */}
      {readOnly ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--s3)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          <span style={{ color: "var(--ink3)" }}>
            <AdminIcon name="lock" size={18} />
          </span>
          <span style={{ fontSize: 13, color: "var(--ink1)", flex: 1 }}>
            {`${lock.holderName} is reviewing this listing (started ${lock.since})`}
          </span>
          <span
            onClick={goNext}
            style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", cursor: "pointer" }}
          >
            Skip to next
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 desktop:grid-cols-[3fr_2fr] desktop:items-start">
        {/* ================= LEFT: the user's view ================= */}
        <div>
          <div
            style={{
              display: "inline-flex",
              background: "var(--s2)",
              borderRadius: 999,
              padding: 3,
              marginBottom: 12,
            }}
          >
            {(["card", "full"] as const).map((t) => (
              <div
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: tab === t ? "var(--s1)" : "transparent",
                  color: tab === t ? "var(--ink1)" : "var(--ink3)",
                  boxShadow: tab === t ? "var(--L1)" : "none",
                }}
              >
                {t === "card" ? "Feed card" : "Full listing"}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>
            This is exactly what users will see.
          </div>

          {tab === "card" ? (
            <div style={{ maxWidth: 380, margin: "0 auto" }}>
              {data.card ? (
                <FeedCard
                  card={data.card}
                  onOpen={() => setTab("full")}
                  onOpenPoster={() => {}}
                  onSave={() => toast("Preview — the buyer's Save does nothing here")}
                  onInquiry={() => toast("Preview — the buyer's Inquiry does nothing here")}
                  onMore={() => {}}
                />
              ) : (
                <div style={{ fontSize: 13, color: "var(--ink3)" }}>
                  This listing has no card yet — it is missing the fields the feed needs.
                </div>
              )}
            </div>
          ) : (
            <FullListing full={data.full} />
          )}
        </div>

        {/* ================= RIGHT: the review panel ================= */}
        <div style={{ opacity: readOnly ? 0.6 : 1, pointerEvents: readOnly ? "none" : "auto" }}>
          <SecHead>Risk</SecHead>
          <div style={{ background: "var(--errorSoft)", borderRadius: 8, padding: 14, marginTop: 4 }}>
            <div style={{ marginBottom: 10 }}>
              <RiskBadge score={data.risk.score} />
            </div>
            {data.risk.reasons.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--ink2)" }}>
                Nothing flagged — new account, prior rejections, number patterns and reports all
                clear.
              </div>
            ) : (
              data.risk.reasons.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    color: "var(--ink2)",
                    marginBottom: 5,
                  }}
                >
                  <span style={{ color: "var(--error)" }}>
                    <AdminIcon name="alert" size={14} />
                  </span>
                  <span style={{ flex: 1 }}>{r.text}</span>
                  <span style={{ fontWeight: 700, color: "var(--error)" }}>{r.points}</span>
                </div>
              ))
            )}
          </div>

          <SecHead>Submitted fields</SecHead>
          <div>
            {data.fields.map((f) => (
              <div
                key={f.key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 0",
                  borderTop: "1px solid var(--divider)",
                }}
              >
                <div style={{ fontSize: 13, color: "var(--ink3)", width: 110, flex: "none" }}>
                  {f.label}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--ink1)",
                    flex: 1,
                    fontWeight: f.warn ? 600 : 400,
                  }}
                >
                  {f.value}
                </div>
                <span
                  onClick={() => {
                    // template 740 — clicking a field's note icon opens the
                    // composer with that field already attached.
                    setChangeChips((c) => (c.includes(f.label) ? c : [...c, f.label]));
                    setOverlay("changes");
                  }}
                  title="Add a note to this field"
                  style={{ color: "var(--ink3)", cursor: "pointer", flex: "none", opacity: 0.6 }}
                >
                  <AdminIcon name="note" size={16} />
                </span>
              </div>
            ))}
            <div style={{ padding: "7px 0", borderTop: "1px solid var(--divider)" }}>
              <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 4 }}>Description</div>
              <div style={{ fontSize: 13, color: "var(--ink1)", lineHeight: 1.5 }}>
                {data.full.description || "—"}
              </div>
            </div>
          </div>

          {data.openReports > 0 ? (
            <div style={{ background: "var(--errorSoft)", borderRadius: 8, padding: 12, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ color: "var(--error)" }}>
                  <AdminIcon name="flag" size={18} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink1)" }}>
                  {`This listing was reported ${data.openReports} time${data.openReports === 1 ? "" : "s"}`}
                </span>
              </div>
              <span
                onClick={() => router.push(SCREEN_ROUTES.reports)}
                style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", cursor: "pointer" }}
              >
                Open reports →
              </span>
            </div>
          ) : null}

          <SecHead>Location</SecHead>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink1)" }}>
            <span style={{ color: "var(--ink3)" }}>
              <AdminIcon name="pin" size={16} />
            </span>
            {data.locationTrail || "—"}
          </div>

          <SecHead>Ownership document</SecHead>
          <div style={{ background: "var(--s2)", borderRadius: 8, padding: 12, marginTop: 4 }}>
            {data.doc.key ? (
              <>
                <div style={{ display: "flex", gap: 12 }}>
                  <div
                    style={{
                      width: 64,
                      height: 80,
                      flex: "none",
                      borderRadius: 6,
                      background:
                        "repeating-linear-gradient(135deg,var(--s3),var(--s3) 6px,var(--border) 6px,var(--border) 12px)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--ink3)",
                    }}
                  >
                    <AdminIcon name="file" size={24} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 6 }}>
                      Check the name and address against the submitted fields.
                    </div>
                    <DocRow label="Doc type" value={data.doc.type ?? "—"} />
                    <DocRow label="Name on doc" value={data.doc.nameOnDoc ?? "not given"} />
                    <DocRow label="Name on account" value={data.doc.nameOnAccount} />
                  </div>
                </div>
                {data.doc.mismatch ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <Badge
                      bg="var(--warningSoft)"
                      fg="var(--warning)"
                      style={{ textTransform: "none", letterSpacing: 0 }}
                    >
                      ⚠ Name mismatch
                    </Badge>
                    <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                      Co-ownership and POA are normal — see SOP
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ink3)" }}>
                No ownership document was uploaded with this listing.
              </div>
            )}
          </div>

          <SecHead>Poster</SecHead>
          <div style={{ background: "var(--s2)", borderRadius: 8, padding: 12, marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar initials={data.poster.initials} size={40} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink1)" }}>
                  {data.poster.name}
                </div>
                <div style={{ marginTop: 3 }}>
                  <Badge
                    bg="var(--s3)"
                    fg="var(--ink3)"
                    style={{ textTransform: "none", letterSpacing: 0 }}
                  >
                    {data.poster.role}
                  </Badge>
                </div>
              </div>
              {data.poster.isNew ? (
                <Badge bg="var(--warningSoft)" fg="var(--warning)">
                  New account
                </Badge>
              ) : null}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink3)", lineHeight: 1.7 }}>
              <div>{`Registered ${data.poster.registered}`}</div>
              <div>{`Listings: ${data.poster.listings} · Rejections: ${data.poster.rejections} · Reports: ${data.poster.reports}`}</div>
              <div>{`Phone ${data.poster.phoneVerified ? "verified ✓" : "unverified"} · ID ${data.poster.idVerified ? "verified ✓" : "pending"}`}</div>
            </div>
            <span
              onClick={() => router.push(SCREEN_ROUTES.users)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--accent)",
                cursor: "pointer",
                display: "inline-block",
                marginTop: 8,
              }}
            >
              Open user →
            </span>
          </div>

          <SecHead>Prior history</SecHead>
          <div style={{ fontSize: 11, color: "var(--ink3)", lineHeight: 1.8 }}>
            {data.history.length === 0 ? (
              <div>Submitted once, never decided.</div>
            ) : (
              data.history.map((h, i) => <div key={i}>{`${h.when} — ${h.what}`}</div>)
            )}
            {data.rejectCount > 0 ? (
              <div style={{ marginTop: 6 }}>
                <Badge
                  bg="var(--warningSoft)"
                  fg="var(--warning)"
                  style={{ textTransform: "none", letterSpacing: 0 }}
                >
                  {`${data.rejectCount} of 3 rejections used`}
                </Badge>
              </div>
            ) : null}
          </div>

          <SecHead>SOP checklist</SecHead>
          <div style={{ background: "var(--s2)", borderRadius: 8, padding: 12, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink1)", marginBottom: 8 }}>
              Review checklist
            </div>
            {SOP.map((item, i) => (
              <label
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  fontSize: 11,
                  color: "var(--ink2)",
                  marginBottom: 7,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(sop[i])}
                  onChange={() => setSop((s) => ({ ...s, [i]: !s[i] }))}
                  style={{ marginTop: 1, accentColor: "var(--accent)" }}
                />
                {item}
              </label>
            ))}
          </div>

          {/* ---- sticky action bar (template 787-791) ---- */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 20,
              position: "sticky",
              bottom: 0,
              background: "var(--page)",
              paddingTop: 12,
              paddingBottom: 4,
              borderTop: "1px solid var(--divider)",
            }}
          >
            <Btn label="Approve" kind="primary" onClick={() => setOverlay("approve")} style={{ flex: 1 }} />
            <Btn
              label="Request changes"
              kind="warn"
              onClick={() => setOverlay("changes")}
              style={{ flex: 1 }}
            />
            <Btn label="Reject" kind="danger" onClick={() => setOverlay("reject")} style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => setOverlay("more")}
              aria-label="More"
              style={{
                width: 40,
                height: 40,
                flex: "none",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--s1)",
                color: "var(--ink2)",
                cursor: "pointer",
              }}
            >
              <AdminIcon name="dots" size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* ================= overlays ================= */}
      {overlay === "approve" ? (
        <Modal
          title="Approve this listing?"
          onClose={() => setOverlay(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setOverlay(null)} />
              <Btn
                label={busy ? "Approving…" : "Approve"}
                kind="primary"
                onClick={() => decide({ action: "approve" }, "Approved")}
              />
            </>
          }
        >
          <div style={{ fontSize: 13, color: "var(--ink1)", fontWeight: 600, marginBottom: 8 }}>
            {`${data.title} · ${data.full.price} · ${data.poster.name}`}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink3)",
              lineHeight: 1.5,
              background: "var(--infoSoft)",
              padding: 10,
              borderRadius: 8,
            }}
          >
            It will go live immediately, generate a 24-hour story and notify the poster.
          </div>
        </Modal>
      ) : null}

      {overlay === "reject" ? (
        <Modal
          title="Reject this listing?"
          onClose={() => setOverlay(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setOverlay(null)} />
              <Btn
                label={busy ? "Rejecting…" : "Reject"}
                kind="dangerFill"
                onClick={() =>
                  decide(
                    {
                      action: "reject",
                      reason: rejectReason === "Other" ? otherReason.trim() : rejectReason,
                    },
                    "Rejected",
                  )
                }
              />
            </>
          }
        >
          <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 10 }}>
            Choose a reason. The poster is notified.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {REJECT_REASONS.map((r) => (
              <label
                key={r}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 4px",
                  fontSize: 13,
                  color: "var(--ink1)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={rejectReason === r}
                  onChange={() => setRejectReason(r)}
                  style={{ accentColor: "var(--accent)" }}
                />
                {r}
              </label>
            ))}
          </div>
          {rejectReason === "Other" ? (
            <textarea
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              placeholder="Describe the reason…"
              style={{
                width: "100%",
                height: 70,
                marginTop: 8,
                padding: 10,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--s2)",
                color: "var(--ink1)",
                fontSize: 13,
                fontFamily: "inherit",
                resize: "none",
              }}
            />
          ) : null}
          {/* The design shows this warning unconditionally; here it appears when
              it is TRUE — this really is the third strike. */}
          {data.rejectCount >= 2 ? (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: "var(--warningSoft)",
                borderRadius: 8,
                fontSize: 11,
                color: "var(--ink2)",
              }}
            >
              This is rejection 3 of 3 — the listing will be locked and the poster must contact
              support.
            </div>
          ) : null}
        </Modal>
      ) : null}

      {overlay === "changes" ? (
        <RightSheet
          title="Request changes"
          onClose={() => setOverlay(null)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setOverlay(null)} style={{ flex: 1 }} />
              <Btn
                label={busy ? "Sending…" : "Send change request"}
                kind="primary"
                style={{ flex: 1 }}
                onClick={() => {
                  const payload = Object.fromEntries(
                    changeChips.map((c) => [c, notes[c] ?? CHANGE_TEMPLATES[c] ?? ""]),
                  );
                  if (!Object.values(payload).some((v) => v.trim())) {
                    toast("Attach a note to at least one field");
                    return;
                  }
                  decide({ action: "request_changes", notes: payload }, "Change request sent");
                }}
              />
            </>
          }
        >
          <div style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 12, lineHeight: 1.5 }}>
            Attach notes to the fields that need fixing. The poster sees each note next to that
            field.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {Object.keys(CHANGE_TEMPLATES).map((c) => (
              <Chip
                key={c}
                label={c}
                active={changeChips.includes(c)}
                onClick={() =>
                  setChangeChips((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))
                }
              />
            ))}
          </div>
          {changeChips.map((c) => (
            <div key={c} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink1)", marginBottom: 6 }}>
                {c}
              </div>
              <textarea
                value={notes[c] ?? CHANGE_TEMPLATES[c] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [c]: e.target.value }))}
                style={{
                  width: "100%",
                  height: 64,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--s2)",
                  color: "var(--ink1)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "none",
                }}
              />
            </div>
          ))}
          <div
            style={{
              padding: 10,
              background: "var(--infoSoft)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--ink2)",
            }}
          >
            This keeps the listing pending and does not count as a rejection.
          </div>
        </RightSheet>
      ) : null}

      {overlay === "more" ? (
        <SheetMenu onClose={() => setOverlay(null)}>
          {[
            ["Open in user view", () => window.open(`/property/${data.id}`, "_blank")],
            ["Skip for now", goNext],
          ].map(([label, run]) => (
            <div
              key={label as string}
              onClick={() => {
                setOverlay(null);
                (run as () => void)();
              }}
              style={{
                padding: "12px 14px",
                fontSize: 14,
                color: "var(--ink1)",
                cursor: "pointer",
                borderRadius: 8,
              }}
            >
              {label as string}
            </div>
          ))}
        </SheetMenu>
      ) : null}
    </div>
  );
}

/* template 736 */
function SecHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink3)",
        textTransform: "uppercase",
        letterSpacing: ".3px",
        margin: "20px 0 10px",
      }}
    >
      {children}
    </div>
  );
}

function DocRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 12, marginBottom: 3 }}>
      <span style={{ color: "var(--ink3)" }}>{`${label}: `}</span>
      <span style={{ color: "var(--ink1)" }}>{value}</span>
    </div>
  );
}

/* template 718-729 — the full listing as P4 draws it, from the row under review */
function FullListing({ full }: { full: ReviewPayload["full"] }) {
  return (
    <div
      style={{
        maxWidth: 520,
        margin: "0 auto",
        background: "var(--s1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "var(--L1)",
      }}
    >
      <div style={{ position: "relative", height: 300, background: "var(--s2)" }}>
        {full.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={full.photos[0]}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink3)",
              fontSize: 11,
            }}
          >
            no photos
          </div>
        )}
        {full.photos.length > 1 ? (
          <span
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "rgba(0,0,0,.6)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 999,
            }}
          >
            {`1 / ${full.photos.length}`}
          </span>
        ) : null}
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink1)" }}>{full.price}</div>
        <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 2 }}>{full.summary}</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 6,
            fontSize: 13,
            color: "var(--ink2)",
          }}
        >
          <span style={{ color: "var(--ink3)" }}>
            <AdminIcon name="pin" size={15} />
          </span>
          {full.location}
        </div>

        {full.specs.length ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${full.specs.length},1fr)`,
              gap: 1,
              background: "var(--divider)",
              border: "1px solid var(--divider)",
              borderRadius: 8,
              overflow: "hidden",
              marginTop: 12,
            }}
          >
            {full.specs.map((s) => (
              <div key={s.label} style={{ background: "var(--s1)", padding: 10, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink1)" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--ink3)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        ) : null}

        {full.amenities.length ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink1)", margin: "16px 0 8px" }}>
              Amenities
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {full.amenities.map((a) => (
                <Badge
                  key={a}
                  bg="var(--s2)"
                  fg="var(--ink2)"
                  style={{
                    textTransform: "none",
                    letterSpacing: 0,
                    fontWeight: 400,
                    borderRadius: 999,
                    padding: "4px 10px",
                  }}
                >
                  {a}
                </Badge>
              ))}
            </div>
          </>
        ) : null}

        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink1)", margin: "16px 0 6px" }}>
          Description
        </div>
        <div style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.5 }}>
          {full.description || "—"}
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: "var(--s2)",
            borderRadius: 8,
            fontSize: 11,
            color: "var(--ink3)",
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <span>
            <AdminIcon name="shield" size={16} />
          </span>
          Never pay a deposit before visiting. HomzList does not verify property ownership.
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * The five surface types the design uses, and nothing else.
 *
 * §5 of the module brief: where a click lands is part of the design. A thing
 * that opens as a `rightSheet` in the template must not become a dropdown here,
 * and a `pushPanel` must not become a route. These are the four overlay shells
 * (the fifth surface, the stacked side panel, lives in panel-stack.tsx):
 *
 *   Modal          template 1510  centred, 420 wide, 16 radius, scaleIn .2s
 *   RightSheet     template 1516  420 wide (100% mobile), full height, 56 header
 *   SheetMenu      template  967  bottom sheet, 380 wide + 24 bottom margin
 *   TopDrop        template 1523  anchored dropdown, top 60, 340 wide
 *   CenteredDrop   template 1608  global search: top 56, centred, 480 wide
 *
 * The prototype positions these `absolute` inside its device frame; the frame IS
 * the viewport here, so they are `fixed`. Everything else is the design's value.
 */

import { useEffect, type ReactNode } from "react";
import { AdminIcon } from "./icons";

/** Esc closes the top-most surface — template 263. */
export function useEscape(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape]);
}

/* ── template 1509 — backdrop(kids,align) ─────────────────────────────────── */
export function Backdrop({
  children,
  align = "center",
  onClose,
  zIndex = 100,
}: {
  children: ReactNode;
  align?: "center" | "stretch" | "flex-end";
  onClose: () => void;
  zIndex?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        background: "rgba(0,0,0,.5)",
        display: "flex",
        alignItems: align,
        justifyContent: "center",
        animation: "fadeIn .2s ease",
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

/* ── template 1510-1515 — modal(title,body,footer,w) ──────────────────────── */
export function Modal({
  title,
  children,
  footer,
  width = 420,
  onClose,
}: {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  onClose: () => void;
}) {
  useEscape(onClose);
  return (
    <Backdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "100%",
          maxHeight: "88%",
          overflowY: "auto",
          background: "var(--s1)",
          borderRadius: 16,
          boxShadow: "var(--L3)",
          border: "1px solid var(--border)",
          animation: "scaleIn .2s ease",
        }}
      >
        <div style={{ padding: "20px 20px 16px" }}>
          {title ? (
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: "var(--ink1)",
                marginBottom: 12,
              }}
            >
              {title}
            </div>
          ) : null}
          {children}
        </div>
        {footer ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              padding: "0 20px 20px",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </Backdrop>
  );
}

/* ── template 1516-1522 — rightSheet(title,body,footer) ───────────────────────
   Full height, own 56px titled header with ×, optional footer button row.
   420px from tablet up; 100% and slide-UP on mobile.                         */
export function RightSheet({
  title,
  children,
  footer,
  onClose,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  useEscape(onClose);
  return (
    <Backdrop align="stretch" onClose={onClose}>
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        className="w-full animate-[slideUp_.3s_cubic-bezier(0.2,0,0,1)] md:w-[420px] md:animate-[slideRight_.25s_cubic-bezier(0.2,0,0,1)]"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          maxWidth: "100%",
          background: "var(--s1)",
          boxShadow: "var(--L3)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            height: 56,
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 16px",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink1)", flex: 1 }}>
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              border: "none",
              background: "transparent",
              color: "var(--ink3)",
              cursor: "pointer",
            }}
          >
            <AdminIcon name="x" size={20} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>{children}</div>
        {footer ? (
          <div
            style={{
              flex: "none",
              padding: 16,
              borderTop: "1px solid var(--divider)",
              display: "flex",
              gap: 8,
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </Backdrop>
  );
}

/* ── template 967 — sheetMenu(items) ──────────────────────────────────────────
   Bottom sheet. Full width on mobile; 380 wide with a 24px gap under it above.
   Its own backdrop (rgba(0,0,0,.4), not the .5 of `backdrop`).               */
export function SheetMenu({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEscape(onClose);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "fadeIn .15s ease",
        background: "rgba(0,0,0,.4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mb-0 w-full md:mb-6 md:w-[380px]"
        style={{
          background: "var(--s1)",
          borderRadius: "16px 16px 0 0",
          padding: 8,
          animation: "slideUp .25s ease",
          boxShadow: "var(--L3)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ── template 1523 — topDrop(kids,right) ──────────────────────────────────── */
export function TopDrop({
  children,
  right = 12,
  top = 60,
  width = 340,
  onClose,
}: {
  children: ReactNode;
  right?: number;
  top?: number;
  width?: number;
  onClose: () => void;
}) {
  useEscape(onClose);
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, animation: "fadeIn .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top,
          right,
          width,
          maxWidth: "calc(100% - 24px)",
          background: "var(--s1)",
          borderRadius: 12,
          boxShadow: "var(--L3)",
          border: "1px solid var(--border)",
          overflow: "hidden",
          animation: "scaleIn .18s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ── template 1607-1611 — the global search surface ──────────────────────────
   NOT a dropdown under the trigger: top 56, horizontally centred, 480 wide,
   and on mobile pinned to left:12 / right:12 instead.                        */
export function CenteredDrop({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEscape(onClose);
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, animation: "fadeIn .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="left-3 right-3 w-auto md:left-1/2 md:right-auto md:w-[480px] md:-translate-x-1/2"
        style={{
          position: "absolute",
          top: 56,
          maxWidth: "calc(100% - 24px)",
          background: "var(--s1)",
          borderRadius: 12,
          boxShadow: "var(--L3)",
          border: "1px solid var(--border)",
          overflow: "hidden",
          animation: "scaleIn .18s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}

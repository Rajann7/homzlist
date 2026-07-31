"use client";

/**
 * The panel stack — template 1278-1308, and the backbone of the whole panel:
 * the prototype calls `pushPanel` 58 times. A user, a listing detail, a payment
 * detail, a plan editor, a ticket, a chat — all of these are STACKED SIDE
 * PANELS. Navigating to a new URL instead is a bug, not an implementation
 * choice (§5).
 *
 * What the design specifies, all reproduced below:
 *   · pinned top:0 bottom:0, 480px wide from tablet up, 100% wide on mobile
 *   · each older panel pushed right by (top - i) * 24 so the stack is visible;
 *     no offset on mobile
 *   · its own 56px breadcrumb bar — `Screen › Panel › Panel` — where each crumb
 *     pops back to that level and × closes the top panel
 *   · backdrop rgba(0,0,0,.4) at z 90+top; clicking it pops ONE level
 *   · enter slideRight .25s cubic-bezier(0.2,0,0,1); mobile slideUp .3s
 *
 * Panel bodies are registered per type by the parts that own them; this file
 * owns only the stack.
 */

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AdminIcon } from "./icons";
import { SCREEN_TITLES } from "./admin-context";
import { useEscape } from "./overlays";

export type PanelEntry = {
  type: string;
  /** identity of the thing being shown — the panel body fetches from the server with it */
  data: Record<string, unknown>;
  /** currently selected tab inside the panel, when it has tabs */
  tab: string | null;
};

type PanelCtx = {
  panels: PanelEntry[];
  pushPanel: (type: string, data?: Record<string, unknown>) => void;
  popPanel: () => void;
  /** pop back to a given depth — 0 closes them all */
  popTo: (depth: number) => void;
  setPanelTab: (tab: string) => void;
};

const Ctx = createContext<PanelCtx | null>(null);

export function usePanels(): PanelCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePanels must be used inside <PanelStackProvider>");
  return ctx;
}

/**
 * How each panel type labels itself in the breadcrumb — template 1273.
 * A part that adds a panel type adds its crumb here.
 */
export type PanelRenderer = {
  crumb: (panel: PanelEntry) => string;
  body: (panel: PanelEntry) => ReactNode;
};

export type PanelRegistry = Record<string, PanelRenderer>;

export function PanelStackProvider({
  registry,
  screen,
  children,
}: {
  registry: PanelRegistry;
  /** the screen underneath the stack — the first breadcrumb */
  screen: string;
  children: ReactNode;
}) {
  const [panels, setPanels] = useState<PanelEntry[]>([]);

  const pushPanel = useCallback((type: string, data?: Record<string, unknown>) => {
    setPanels((s) => [...s, { type, data: data ?? {}, tab: null }]);
  }, []);
  const popPanel = useCallback(() => setPanels((s) => s.slice(0, -1)), []);
  const popTo = useCallback((depth: number) => setPanels((s) => s.slice(0, depth)), []);
  const setPanelTab = useCallback((tab: string) => {
    setPanels((s) =>
      s.length ? [...s.slice(0, -1), { ...s[s.length - 1], tab }] : s,
    );
  }, []);

  const value = useMemo<PanelCtx>(
    () => ({ panels, pushPanel, popPanel, popTo, setPanelTab }),
    [panels, pushPanel, popPanel, popTo, setPanelTab],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <PanelStack registry={registry} screen={screen} />
    </Ctx.Provider>
  );
}

function PanelStack({ registry, screen }: { registry: PanelRegistry; screen: string }) {
  const { panels, popPanel, popTo } = usePanels();
  useEscape(popPanel);
  if (!panels.length) return null;

  const top = panels.length - 1;
  const screenTitle = SCREEN_TITLES[screen] ?? "Admin";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
      {/* backdrop — click pops ONE level, not all of them */}
      <div
        onClick={popPanel}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,.4)",
          zIndex: 90 + top,
          animation: "fadeIn .2s ease",
        }}
      />
      {panels.map((p, i) => {
        const renderer = registry[p.type];
        const trail = [
          screenTitle,
          ...panels.slice(0, i + 1).map((x) => registry[x.type]?.crumb(x) ?? "Panel"),
        ];
        const offset = (top - i) * 24;
        return (
          <div
            key={i}
            className={
              "w-full md:w-[480px] " +
              (i === top
                ? "animate-[slideUp_.3s_cubic-bezier(0.2,0,0,1)] md:animate-[slideRight_.25s_cubic-bezier(0.2,0,0,1)] "
                : "") +
              "right-0 md:right-[var(--panel-offset)]"
            }
            style={{
              // the stack offset belongs to tablet+desktop only; mobile is flush
              ["--panel-offset" as string]: `${offset}px`,
              position: "absolute",
              top: 0,
              bottom: 0,
              maxWidth: "100%",
              background: "var(--s1)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "var(--L3)",
              display: "flex",
              flexDirection: "column",
              zIndex: 91 + i,
            }}
          >
            {/* 56px breadcrumb bar — Screen › Panel › Panel */}
            <div
              style={{
                height: 56,
                flex: "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 16px",
                borderBottom: "1px solid var(--divider)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  overflow: "hidden",
                }}
              >
                {trail.map((t, j) => {
                  const isLast = j === trail.length - 1;
                  return (
                    <Fragment key={j}>
                      {j ? <span style={{ color: "var(--ink3)" }}>›</span> : null}
                      <span
                        onClick={isLast ? undefined : () => popTo(j)}
                        style={{
                          color: isLast ? "var(--ink1)" : "var(--accent)",
                          fontWeight: isLast ? 600 : 400,
                          cursor: isLast ? "default" : "pointer",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 160,
                        }}
                      >
                        {t}
                      </span>
                    </Fragment>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={popPanel}
                aria-label="Close panel"
                style={{
                  width: 32,
                  height: 32,
                  flex: "none",
                  border: "none",
                  background: "transparent",
                  color: "var(--ink3)",
                  cursor: "pointer",
                }}
              >
                <AdminIcon name="x" size={20} />
              </button>
            </div>
            {renderer ? (
              renderer.body(p)
            ) : (
              <div style={{ padding: 24, color: "var(--ink3)" }}>—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

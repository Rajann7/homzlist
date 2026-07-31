"use client";

/**
 * The three pieces of panel-wide state the design's `Component` class holds and
 * every screen reaches for: the signed-in admin's role, the toast, and the
 * panel stack. In the prototype they are `this.state.role` / `this.toast()` /
 * `this.state.panels`; here they are context so the same call sites read the
 * same way.
 *
 * The role in this context is the SERVER's answer, hydrated from the session on
 * every request — it drives the design's disabled buttons and lock gates only.
 * It is never the authorization itself: every mutation re-checks the role
 * server-side (Doc9), so a tampered client value buys nothing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The screen tables moved to ./screens (no "use client"), because the route
 * guards are Server Components and cannot read a constant out of a client
 * module. Re-exported here so every existing client call site is unchanged.
 */
export {
  ROLE_RANK,
  SCREEN_MIN_ROLE,
  SCREEN_TITLES,
  QUEUE_SCREENS,
  canSee,
  type AdminRole,
} from "./screens";
import { ROLE_RANK, type AdminRole } from "./screens";

export type AdminIdentity = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  initials: string;
};

type AdminCtx = {
  me: AdminIdentity;
  /** environment ribbon — server-set, never guessed from the hostname client-side */
  staging: boolean;
  toast: (message: string) => void;
  toastMessage: string | null;
};

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminProvider>");
  return ctx;
}

/** `this.state.role` — read by gatedBtn/lockGate to draw the design's gated UI. */
export function useAdminRole(): AdminRole {
  return useAdmin().me.role;
}

/** `this.toast(…)` — template line 276, a 3s auto-dismissing message. */
export function useToast() {
  return useAdmin().toast;
}

export function AdminProvider({
  me,
  staging,
  children,
}: {
  me: AdminIdentity;
  staging: boolean;
  children: ReactNode;
}) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const value = useMemo<AdminCtx>(
    () => ({ me, staging, toast, toastMessage }),
    [me, staging, toast, toastMessage],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

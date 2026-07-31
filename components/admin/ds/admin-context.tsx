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

export type AdminRole = "staff" | "admin" | "super";

/** template line 249 */
export const ROLE_RANK: Record<AdminRole, number> = { staff: 1, admin: 2, super: 3 };

/** template line 248 — which screens each role may open at all. */
export const SCREEN_MIN_ROLE: Record<string, AdminRole> = {
  staff: "super",
  audit: "super",
  settings: "super",
  users: "admin",
  listingsMaster: "admin",
  payments: "admin",
  finance: "admin",
  plans: "admin",
  coupons: "admin",
  grants: "admin",
  masterData: "admin",
  cms: "admin",
  templates: "admin",
  disputes: "admin",
  cron: "admin",
  trash: "admin",
  exports: "admin",
  analytics: "admin",
};

/** template line 1994 */
export function canSee(role: AdminRole, screen: string): boolean {
  const need = SCREEN_MIN_ROLE[screen];
  if (!need) return true;
  return ROLE_RANK[role] >= ROLE_RANK[need];
}

/** template line 244 */
export const SCREEN_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  listings: "Listings",
  review: "Review",
  requirements: "Requirements",
  boosts: "Boosts",
  verifications: "Verifications",
  appeals: "Appeals",
  reports: "Reports",
  users: "Users",
  listingsMaster: "Listings",
  payments: "Payments",
  finance: "Finance",
  plans: "Plans",
  coupons: "Coupons",
  grants: "Grants & trials",
  masterData: "Master data",
  cms: "Content",
  templates: "Templates",
  settings: "Settings",
  tickets: "Tickets",
  disputes: "Disputes",
  staff: "Staff",
  audit: "Audit log",
  cron: "System status",
  analytics: "Analytics",
  trash: "Trash",
  exports: "Exports",
};

/** template line 245 */
export const QUEUE_SCREENS = [
  "listings",
  "review",
  "requirements",
  "boosts",
  "verifications",
  "appeals",
  "reports",
];

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

"use client";

import { createContext, useContext } from "react";

/**
 * The viewer's role, resolved ONCE on the server and handed down.
 *
 * The bottom nav differs by role (a builder has no Search — see `navForRole`),
 * and almost every screen that renders it is a client component. Fetching
 * `/api/v1/profile/me` inside the nav would mean one request per screen AND a
 * five-icon flash before the answer arrives. The seller layout is a server
 * component that already has the session, so the role travels with the tree.
 *
 * This is a UI-shape hint only. It decides which ICON renders and nothing else:
 * every route the nav points at is still authorised server-side on its own, so
 * a tampered value buys nothing (CLAUDE.md rule 4).
 */
const RoleContext = createContext<string | null>(null);

export function RoleProvider({ role, children }: { role: string | null; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): string | null {
  return useContext(RoleContext);
}

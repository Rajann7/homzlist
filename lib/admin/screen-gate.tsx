import "server-only";
import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { ScreenLock } from "@/components/admin/panel/ScreenLock";
import { AdminAuthError, currentAdmin, ROLE_RANK, type AdminIdentity } from "./guard";
import { superAdminContact } from "./panel";
import type { AdminRole } from "./session";

/**
 * The role gate every panel SCREEN uses, in place of a bare `requireAdmin`.
 *
 * `requireAdmin` throws, which is right for an API route — a route that forgets
 * to check the result cannot carry on with null. For a screen it was wrong: the
 * throw escaped the server component and React rendered the app's generic
 * "Something went wrong" boundary, so a Staff admin opening /users was told the
 * panel had crashed rather than that they lack access. The design ships a
 * screen for exactly this (template 1995-1999) and nothing was rendering it.
 *
 * Not authorization — every endpoint still re-checks for itself. This decides
 * what the SCREEN shows, and it fails the same closed way `requireAdmin` does:
 * no session at all still lands on /login, and a denied screen renders no data,
 * only the lock.
 *
 *   const gate = await screenGate("admin");
 *   if (!gate.ok) return gate.lock;
 */
export async function screenGate(
  need: AdminRole,
): Promise<{ ok: true; me: AdminIdentity } | { ok: false; lock: ReactElement }> {
  const me = await currentAdmin();
  // Unauthenticated is not a lock screen — there is nobody to tell. Same
  // redirect the panel layout does, kept here so a screen rendered outside it
  // cannot leak.
  if (!me) redirect("/login");

  if (ROLE_RANK[me.role] >= ROLE_RANK[need]) return { ok: true, me };

  return {
    ok: false,
    lock: (
      <ScreenLock need={need} role={me.role} superAdminName={await superAdminContact(me.id)} />
    ),
  };
}

/** Re-exported so a screen importing the gate does not need two imports. */
export { AdminAuthError };

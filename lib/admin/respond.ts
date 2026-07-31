import "server-only";
import { fail } from "@/lib/api";
import { AdminAuthError } from "./guard";

/**
 * One place that turns an authorization failure into a response, so every admin
 * route answers identically.
 *
 * Unauthenticated → 401. Wrong role → 403. Anything else is a 500 with no
 * detail on the wire (Doc9 §20 — the message stays in the server log).
 *
 * Note what this does NOT do: it does not 404 an authenticated admin who lacks
 * the role. Enumeration only matters to someone who is not already inside the
 * panel, and the design draws a real "Admin access required" lock gate for the
 * in-panel case (template 1995) — answering 404 there would make that screen
 * impossible to build honestly.
 */
export function adminErrorResponse(e: unknown) {
  if (e instanceof AdminAuthError) {
    return e.kind === "unauthenticated" ? fail("UNAUTHORIZED") : fail("FORBIDDEN");
  }
  console.error("[admin]", e);
  return fail("SERVER_ERROR");
}

import { jwtVerify } from "jose";

/**
 * Edge-safe access-token verification for middleware (Doc6 §4 / Doc9 §2).
 * Uses ONLY jose + env (no Redis, no node:crypto) so it runs on the Edge runtime.
 * Refresh/rotation (KV-backed) lives in the Node route /api/v1/auth/refresh.
 */
export async function verifyAccessEdge(
  token: string | undefined,
): Promise<{ sub: string; role: string | null; registered: boolean } | null> {
  if (!token) return null;
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.typ !== "access" || !payload.sub) return null;
    return { sub: payload.sub as string, role: (payload.role as string) ?? null, registered: Boolean(payload.registered) };
  } catch {
    return null;
  }
}

/**
 * The same check for the ADMIN session (hz_ast, typ "admin").
 *
 * The admin zone is a different identity from the seller session — a signed-in
 * seller is not a signed-in admin — so it needs its own verifier. This is only
 * the cheap edge gate that decides login-vs-panel; whether the seat still
 * exists and what level it holds is re-read from the database on every request
 * by lib/admin/auth (Doc3 §1.1's "revoked instantly"), which middleware cannot
 * do without a DB call on the Edge.
 */
export async function verifyAdminEdge(
  token: string | undefined,
): Promise<{ sub: string; level: string } | null> {
  if (!token) return null;
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.typ !== "admin" || !payload.sub) return null;
    return { sub: payload.sub as string, level: (payload.level as string) ?? "staff" };
  } catch {
    return null;
  }
}

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

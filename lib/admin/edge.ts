import { jwtVerify } from "jose";

/**
 * Edge-safe verification of the ADMIN access cookie, for middleware only.
 *
 * The admin zone previously gated on the USER session (`hz_at`). That cookie is
 * host-only to homzlist.com / seller.homzlist.com, so it is never present on
 * account.homzlist.com — every signed-in admin was bounced back to /login and
 * the panel was unreachable. The gate has to read the cookie the admin sign-in
 * actually sets.
 *
 * This mirrors lib/admin/session.ts exactly — same domain-separated secret,
 * same `typ: "admin"` shape — but with WebCrypto instead of node:crypto, since
 * middleware runs on the Edge runtime. It is a CHEAP gate, not the
 * authorization: `requireAdmin()` re-reads the staff row and the session on
 * every request, so a valid-but-revoked token gets past here and is refused
 * there. Keeping it that way is deliberate — the Edge cannot reach Supabase or
 * KV, and a gate that pretends otherwise would be lying about what it checked.
 */

let cached: Uint8Array | null = null;

async function adminSecretEdge(): Promise<Uint8Array | null> {
  if (cached) return cached;
  const base = process.env.JWT_ACCESS_SECRET;
  if (!base) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`homzlist:admin:${base}`),
  );
  cached = new Uint8Array(digest);
  return cached;
}

export async function verifyAdminAccessEdge(
  token: string | undefined,
): Promise<{ sub: string; sid: string } | null> {
  if (!token) return null;
  const secret = await adminSecretEdge();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.typ !== "admin" || !payload.sub || !payload.sid) return null;
    return { sub: String(payload.sub), sid: String(payload.sid) };
  } catch {
    return null;
  }
}

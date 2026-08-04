import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, type UnsafeUnwrappedCookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Server Supabase client bound to the request cookies (Server Components / Route
 * Handlers / Server Actions). Uses the anon key + the user's session cookie, so
 * RLS applies as that user. Cookies are subdomain-scoped for session isolation
 * (Doc6 §4 / Doc9 §2).
 */
export function createClient() {
  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies);
  const { cookieDomain } = serverEnv();
  const isProd = process.env.NODE_ENV === "production";

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true, // token never readable by JS (Doc9 §2)
              secure: isProd,
              sameSite: "lax",
              domain: cookieDomain === "localhost" ? undefined : cookieDomain,
            });
          });
        } catch {
          // Called from a Server Component where cookies are read-only.
          // The middleware refresh path handles writing; safe to ignore here.
        }
      },
    },
  });
}

/**
 * SERVICE-ROLE client — SERVER ONLY. Bypasses RLS. Use only for trusted
 * server-side jobs (webhooks, workers, admin actions) AFTER explicit
 * authorization checks. NEVER import this into a client component.
 * (Doc7 §11 / Doc9 §4 — service_role never reaches the browser.)
 */
export function createServiceClient() {
  const { supabaseServiceRoleKey } = serverEnv();
  // Lazy import keeps supabase-js out of any accidental client bundle path.
  const { createClient: createRawClient } = require("@supabase/supabase-js");
  return createRawClient(publicEnv.supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

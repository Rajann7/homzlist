import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Refreshes the Supabase session on every request and returns both the (possibly
 * mutated) response with refreshed cookies and the current user. Called from
 * middleware.ts. Keeps the httpOnly session cookie rotating (Doc9 §2) with no
 * client-side token exposure and no data flash (SSR auth — Doc6 §4).
 */
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request });

  const { cookieDomain } = serverEnv();
  const isProd = process.env.NODE_ENV === "production";

  // If Supabase isn't configured yet (scaffold / early dev), skip gracefully so
  // the app still boots. Real auth kicks in once env is filled (Module 1).
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    return { response, user: null };
  }

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: isProd,
              sameSite: "lax",
              domain: cookieDomain === "localhost" ? undefined : cookieDomain,
            }),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser() — auth.getUser()
  // revalidates the token server-side (never trust getSession() alone).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}

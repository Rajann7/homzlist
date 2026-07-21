"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Browser Supabase client — uses ONLY the public anon key (Doc7 §11 / Doc9 §4).
 * RLS is the wall that keeps this key safe; the service_role key never comes here.
 * Uses @supabase/ssr (NOT deprecated auth-helpers) per CLAUDE.md stack rule.
 */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The brand strings, from `branding_settings` (Doc1 §12 / Doc7 §181).
 *
 * The admin's Branding tab has always WRITTEN these rows (lib/admin/settings
 * `saveBranding`), but until 9 Aug 2026 nothing on the website READ them — the
 * app name and tagline were typed into the footer, the root layout's title and
 * the PWA manifest as three separate literals. So editing the tagline in the
 * admin changed the admin's own preview and nothing else, which is exactly the
 * "control that writes nothing anyone reads" CLAUDE.md rule 12 bans.
 *
 * Cached in-process for a minute: this is read on every page render, it is two
 * rows of master data, and the admin screen's own promise to the operator is
 * "changes appear for all users within 5 minutes".
 */

const db = () => createServiceClient();

export interface Branding {
  appName: string;
  tagline: string;
}

/**
 * Fallbacks, used only when the row is missing or the table is unreachable —
 * never as the normal path. A brand string that renders empty looks broken in a
 * way a stale-but-real one does not.
 */
const FALLBACK: Branding = {
  appName: "HomzList",
  tagline: "India's trusted property listing platform",
};

const TTL_MS = 60_000;
let cached: { at: number; value: Branding } | null = null;

export async function getBranding(): Promise<Branding> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const { data } = await db()
      .from("branding_settings")
      .select("key, value")
      .in("key", ["app_name", "tagline"]);
    const map = new Map(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    const value: Branding = {
      appName: map.get("app_name")?.trim() || FALLBACK.appName,
      tagline: map.get("tagline")?.trim() || FALLBACK.tagline,
    };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    // The brand is never worth failing a page render over.
    return cached?.value ?? FALLBACK;
  }
}

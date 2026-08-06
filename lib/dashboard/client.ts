"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import type { DashboardCounts } from "./service.types";

export type { DashboardCounts };

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; [k: string]: unknown } };

/**
 * Dashboard counts, read fresh.
 *
 * `cache: "no-store"` is not optional here: the hub is re-opened right after
 * the seller acts on one of its destinations (reply to a lead, cancel a visit),
 * and without it the browser answers the second GET from the first one's
 * response — so the tile keeps showing the old number and reads as broken.
 * Same fix as the six other client helpers.
 */
export async function fetchDashboardCounts(): Promise<ApiResult<{ counts: DashboardCounts }>> {
  try {
    const res = await apiFetch("/api/v1/dashboard", {
      credentials: "same-origin",
      cache: "no-store",
    });
    return (await res.json()) as ApiResult<{ counts: DashboardCounts }>;
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
}

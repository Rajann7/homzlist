import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Risk score (Doc3 §1.4 — "logic-based, NO AI").
 *
 *   new account        +2
 *   prior reject       +2
 *   number-pattern flag +3
 *   reported           +3
 *
 * The queue sorts high-first and marks it red; A4's risk block and the ⓘ tooltip
 * both list the reasons that produced the number. So the score and its reasons
 * are computed together — a badge that says "High · 7" while the tooltip can
 * only name +5 is the kind of thing nobody notices until an admin asks why.
 *
 * "New account" is a judgement the design words as "registered 2h ago", so it is
 * a window, not a flag: 7 days matches the first-listing note A4 renders.
 */

export const RISK_WEIGHTS = {
  newAccount: 2,
  priorReject: 2,
  numberPattern: 3,
  reported: 3,
} as const;

const NEW_ACCOUNT_DAYS = 7;

export interface RiskReason {
  code: keyof typeof RISK_WEIGHTS;
  label: string;
  points: number;
}

export interface Risk {
  score: number;
  band: "low" | "medium" | "high";
  bandLabel: "Low" | "Medium" | "High";
  reasons: RiskReason[];
}

/** P13: 0–2 Low (surface2/ink2) · 3–5 Medium (warning) · 6+ High (error). */
export function bandOf(score: number): Risk["band"] {
  if (score <= 2) return "low";
  if (score <= 5) return "medium";
  return "high";
}

export interface RiskInput {
  posterCreatedAt: string | null;
  rejectCount: number | null;
  flaggedReason: string | null;
  reportCount: number;
  /** Only for the "registered 2h ago" wording in A4's reason row. */
  posterAgeLabel?: string | null;
}

export function scoreRisk(input: RiskInput): Risk {
  const reasons: RiskReason[] = [];

  if (input.posterCreatedAt) {
    const days = (Date.now() - new Date(input.posterCreatedAt).getTime()) / 86_400_000;
    if (days <= NEW_ACCOUNT_DAYS) {
      reasons.push({
        code: "newAccount",
        label: input.posterAgeLabel ? `New account (registered ${input.posterAgeLabel})` : "New account",
        points: RISK_WEIGHTS.newAccount,
      });
    }
  }

  if ((input.rejectCount ?? 0) > 0) {
    reasons.push({
      code: "priorReject",
      label: (input.rejectCount ?? 0) === 1 ? "Prior rejection" : `${input.rejectCount} prior rejections`,
      points: RISK_WEIGHTS.priorReject,
    });
  }

  if (input.flaggedReason) {
    reasons.push({
      code: "numberPattern",
      label: input.flaggedReason,
      points: RISK_WEIGHTS.numberPattern,
    });
  }

  if (input.reportCount > 0) {
    reasons.push({
      code: "reported",
      label: input.reportCount === 1 ? "Reported once" : `Reported ${input.reportCount} times`,
      points: RISK_WEIGHTS.reported,
    });
  }

  const score = reasons.reduce((n, r) => n + r.points, 0);
  const band = bandOf(score);
  return { score, band, bandLabel: band === "low" ? "Low" : band === "medium" ? "Medium" : "High", reasons };
}

/** "2h ago" / "3 days ago" — the wording A4's risk row uses. */
export function ageLabel(iso: string | null): string | null {
  if (!iso) return null;
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Report counts for a page of queue rows, in one query rather than one per row —
 * the N+1 rule in Doc3 §5 applies to the admin panel too.
 */
export async function reportCounts(subjectType: string, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;

  const db = createServiceClient();
  const { data } = await db
    .from("reports")
    .select("subject_id")
    .eq("subject_type", subjectType)
    .in("subject_id", ids)
    .in("status", ["open", "reviewing"]);

  for (const r of (data ?? []) as Array<{ subject_id: string }>) {
    out.set(r.subject_id, (out.get(r.subject_id) ?? 0) + 1);
  }
  return out;
}

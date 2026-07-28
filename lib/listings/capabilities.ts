/**
 * Who may PUBLISH what, in one place (Doc2 §2, as amended 2026-07-28).
 *
 * A Builder posts PROJECTS and nothing else. Sell, Rent and Requirement are the
 * Owner/Broker products; a builder can neither create one nor bring an existing
 * one back to life (migration 0067 took the existing ones down).
 *
 * What this does NOT touch: browsing, saving, chat, proposals, leads, or
 * requirement VIEWING — a builder still answers requirements matched to their
 * projects, they just don't post their own.
 *
 * Every gate that matters is server-side. The UI hides what it can, but these
 * are the functions the route handlers call, because the browser is never the
 * thing that decides (CLAUDE.md rule 4).
 */

export type PostingRole = string | null;

/** Sell / Rent listings — Owner and Broker only. */
export function canPostListing(role: PostingRole): boolean {
  return role === "owner" || role === "broker";
}

/** Requirements — Owner and Broker only. */
export function canPostRequirement(role: PostingRole): boolean {
  return role === "owner" || role === "broker";
}

/** Builder projects — Builder only (Doc2 §6, unchanged). */
export function canPostProject(role: PostingRole): boolean {
  return role === "builder";
}

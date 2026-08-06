/**
 * The dashboard count payload, in its own module.
 *
 * `service.ts` is `server-only`; the client helper needs this shape but must
 * never pull that module into the browser bundle, so the contract lives here
 * and both sides import it.
 */
export interface DashboardCounts {
  /** Live listings I own. */
  listings: number;
  /** Leads still sitting in the `new` stage — the ones waiting on me. */
  leads: number;
  /** Other people's live requirements I could answer, scoped to my city. */
  browseRequirements: number;
  /** My own live requirements. */
  myRequirements: number;
  /** Proposals I sent that are still pending a reply. */
  proposals: number;
  /** Visits ahead of me (proposed or confirmed, not yet past). */
  visits: number;
  /** Boosts running right now. */
  boosts: number;
  /** Active plan name, or null when the seller holds none. */
  plan: string | null;
}

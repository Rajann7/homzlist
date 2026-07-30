/**
 * A15's shapes, shared by the screen and its server reader.
 *
 * Not `server-only`, for the reason A12 found the hard way: Next follows even a
 * type-only import into a server-only module before types are erased.
 */

export interface GrantRow {
  id: string;
  person: { id: string; name: string; initials: string };
  kind: string;
  planName: string;
  days: number;
  reason: string;
  grantedBy: string;
  grantedLabel: string;
  expiresLabel: string;
  usageLabel: string;
  /** Active · Expired · Revoked · No plan attached — the ENTITLEMENT's truth. */
  state: string;
  revocable: boolean;
}

export interface GrantablePlan {
  code: string;
  name: string;
  kind: string;
  roles: string[];
  listingQuota: number;
  requirementQuota: number;
  proposalQuota: number;
  defaultDays: number;
}

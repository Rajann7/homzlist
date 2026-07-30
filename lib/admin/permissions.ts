/**
 * The admin permission matrix (Doc3 §1.1, rendered read-only by A25).
 *
 * This lives in CODE, not in a config table, on purpose — and it is the one
 * exception to CLAUDE.md rule 7 worth stating out loud. Every *displayed* option
 * list belongs in the database, but a matrix that decides who may refund money,
 * delete a user or preserve evidence must not be editable by the thing it
 * guards: a compromised admin session that can rewrite its own permissions has
 * no permissions at all. A25 shows it as a reference table for exactly that
 * reason ("permission matrix view (read-only reference)").
 *
 * Doc3 §1.1 in one line:
 *   Staff = approval queues + support tickets only
 *   Admin = + user/listing edit, coupons, reports, refunds, master data
 *   Super = + plans/pricing, staff, feature flags, audit, evidence, branding, exports oversight
 */

export const STAFF_LEVELS = ["staff", "admin", "super"] as const;
export type StaffLevel = (typeof STAFF_LEVELS)[number];

/** The 19 capabilities A25's matrix enumerates, in its row order. */
export const CAPABILITIES = [
  "queues.view",
  "queues.decide",
  "tickets",
  "users.edit",
  "listings.edit",
  "coupons",
  "refunds",
  "grants",
  "plans",
  "masterdata",
  "cms",
  "templates",
  "flags",
  "branding",
  "staff",
  "audit",
  "evidence",
  "devicebans",
  "users.delete",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Human labels for A25's matrix rows — the screen renders these, in this order. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  "queues.view": "Review queues",
  "queues.decide": "Approve/Reject listings",
  tickets: "Support tickets",
  "users.edit": "Edit users",
  "listings.edit": "Edit listings",
  coupons: "Coupons",
  refunds: "Refunds",
  grants: "Grants & trials",
  plans: "Plans & pricing",
  masterdata: "Master data",
  cms: "CMS",
  templates: "Templates",
  flags: "Feature flags",
  branding: "Branding",
  staff: "Staff management",
  audit: "Audit log",
  evidence: "Evidence preservation",
  devicebans: "Ban device/IP",
  "users.delete": "Delete user",
};

const STAFF_CAPS: Capability[] = ["queues.view", "queues.decide", "tickets"];

const ADMIN_CAPS: Capability[] = [
  ...STAFF_CAPS,
  "users.edit",
  "listings.edit",
  "coupons",
  "refunds",
  "grants",
  "masterdata",
  "cms",
  "templates",
];

const MATRIX: Record<StaffLevel, ReadonlySet<Capability>> = {
  staff: new Set(STAFF_CAPS),
  admin: new Set(ADMIN_CAPS),
  super: new Set(CAPABILITIES),
};

export function can(level: StaffLevel, cap: Capability): boolean {
  return MATRIX[level]?.has(cap) ?? false;
}

/** Every capability a level holds — the shape the client needs to gate its UI. */
export function capabilitiesFor(level: StaffLevel): Capability[] {
  return CAPABILITIES.filter((c) => can(level, c));
}

/**
 * The lowest level that holds a capability — drives the disabled-button tooltip
 * copy P14 specifies ("Admin only" / "Super Admin only").
 */
export function minLevelFor(cap: Capability): StaffLevel {
  return STAFF_LEVELS.find((l) => can(l, cap)) ?? "super";
}

export function tooltipFor(cap: Capability): string {
  const min = minLevelFor(cap);
  return min === "super" ? "Super Admin only" : min === "admin" ? "Admin only" : "";
}

export const LEVEL_LABEL: Record<StaffLevel, string> = {
  staff: "Staff",
  admin: "Admin",
  super: "Super Admin",
};

export function isStaffLevel(v: unknown): v is StaffLevel {
  return typeof v === "string" && (STAFF_LEVELS as readonly string[]).includes(v);
}

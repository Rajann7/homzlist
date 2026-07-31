import "../admin.css";

/**
 * (admin) — account.homzlist.com. Fully isolated (separate cookie scope,
 * Google-auth whitelist checked server-side — Doc6 §4 / Doc9 §21). Reached at
 * the root host path; middleware rewrites "/*" → "/account/*" internally.
 * Admin ships its own 3-device layout (P13-14-15) — do NOT re-viewport it.
 *
 * Deliberately thin: it loads the admin palette and nothing else, because A1
 * (login) renders here with NO session. The shell, the nav and the panel-wide
 * providers live in (panel)/layout.tsx, behind requireAdmin.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // `admin-scope` restores the design's own line-height baseline — see
  // admin.css. Without it every row in the panel sits ~3px taller than drawn.
  return <div className="admin-scope min-h-[100dvh] bg-page">{children}</div>;
}

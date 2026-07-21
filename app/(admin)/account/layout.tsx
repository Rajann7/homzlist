/**
 * (admin) — account.homzlist.com. Fully isolated (separate cookie scope,
 * Google-auth whitelist checked server-side — Doc6 §4 / Doc9 §21). Reached at
 * the root host path; middleware rewrites "/*" → "/account/*" internally.
 * Admin ships its own 3-device layout (P13-14-15) — do NOT re-viewport it.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-page">{children}</div>;
}

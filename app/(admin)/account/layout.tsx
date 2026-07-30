/**
 * (admin) — account.homzlist.com, the isolated admin zone. Middleware rewrites
 * "/*" → "/account/*" internally.
 *
 * Deliberately thin: A1 (login) is a full-page centred card with no shell around
 * it, so the sidebar/header and the auth gate live one level down in the (shell)
 * route group. Keeping them there means "signed in" is a property of the group
 * every real screen belongs to — a new admin page cannot ship unprotected by
 * forgetting to add a check.
 */
export default function AdminZoneLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh]" style={{ background: "var(--bg-page)" }}>{children}</div>;
}

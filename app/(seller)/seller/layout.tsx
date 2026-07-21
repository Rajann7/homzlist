/**
 * (seller) — seller.homzlist.com. Requires a seller session (Owner/Broker/
 * Builder); the middleware redirects guests to /login before this renders
 * (server-side guard, no data flash — Doc6 §4 / Doc9 §28). Reached at the root
 * host path; middleware rewrites "/*" → "/seller/*" internally.
 */
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-page">{children}</div>;
}

import { AppShell, Wordmark, EmptyState } from "@/components";

/**
 * Seller login placeholder. The full P1 auth flow (phone + OTP, dev mode) is
 * Module 1. Middleware already seals the bypass: a logged-in user hitting
 * /login is redirected home before this renders (Doc9 §28).
 */
export default function SellerLogin() {
  return (
    <AppShell showNav={false}>
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6">
        <Wordmark className="text-24" />
        <EmptyState
          title="Sign in"
          subtitle="Phone + OTP login arrives in Module 1 (dev mode: fixed code, no SMS)."
        />
      </div>
    </AppShell>
  );
}

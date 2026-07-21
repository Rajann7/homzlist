import { EmptyState, Wordmark } from "@/components";

/**
 * Admin login placeholder — Google-only, whitelist-checked server-side (Module 11).
 * Non-whitelisted / revoked emails are rejected server-side and logged (Doc9 §21).
 */
export default function AdminLogin() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-admin flex-col items-center justify-center gap-4 px-6">
      <Wordmark className="text-24" />
      <EmptyState title="Admin sign-in" subtitle="Google auth (whitelist) arrives in Module 11." />
    </div>
  );
}

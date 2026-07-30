import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin/auth";
import { googleMode } from "@/lib/admin/google";
import { AdminLoginCard } from "@/components/admin/AdminLoginCard";

/**
 * A1 — Admin login (P13 Part B / Doc5 A1).
 *
 * Google-only by construction: there is no password field on this screen and no
 * endpoint behind it that would accept one (Doc3 §1.1). The two designed error
 * states are driven by ?error= from the callback, which is also what the
 * heartbeat redirects to when a seat is revoked mid-session.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: { error?: string; email?: string };
}) {
  // Already signed in — don't show a sign-in screen to someone who is.
  const session = await currentStaff();
  if (session.ok) redirect("/");

  return (
    <AdminLoginCard
      mode={googleMode()}
      error={searchParams.error ?? null}
      email={searchParams.email ?? null}
      // The design puts the same env chip the shell wears at top-right of A1,
      // so it is obvious BEFORE signing in which environment this is. Decided
      // by the same rule the shell uses.
      env={process.env.NODE_ENV === "production" ? null : "STAGING"}
    />
  );
}

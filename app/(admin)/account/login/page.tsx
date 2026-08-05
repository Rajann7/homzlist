import { redirect } from "next/navigation";
import { AdminLoginScreen } from "@/components/admin/login/AdminLoginScreen";
import { currentAdmin } from "@/lib/admin/guard";
import { readLoginOutcome } from "@/lib/admin/login-outcome";
import { isStagingEnv, supportEmail } from "@/lib/admin/environment";

/**
 * A1 — Admin login (Doc5 A1, template 34-71).
 *
 * Middleware already bounces a signed-in admin away from here, but that gate
 * only checks the token's signature. This re-checks the way every other admin
 * surface does — `currentAdmin()` re-reads the staff row — so an admin revoked
 * a second ago lands on the login screen instead of being sent into a panel
 * that would then refuse them.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminLoginPage() {
  if (await currentAdmin()) redirect("/");

  return (
    <AdminLoginScreen
      outcome={await readLoginOutcome()}
      staging={isStagingEnv()}
      supportEmail={await supportEmail()}
    />
  );
}

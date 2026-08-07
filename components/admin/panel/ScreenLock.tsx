"use client";

import { useRouter } from "next/navigation";
import { LockGate } from "@/components/admin/ds";
import type { AdminRole } from "@/components/admin/ds/screens";

/**
 * The design's lock gate (template 1995-1999), wired to a real Back.
 *
 * `LockGate` had been ported in P0 and then called from nowhere: a screen whose
 * role gate failed threw out of the server component instead, so a Staff admin
 * opening /users got the app's generic "Something went wrong" boundary — an
 * error page for a permission answer. This is the client half (the Go back
 * button needs a router); `screenGate` on the server decides when it shows.
 */
export function ScreenLock({
  need,
  role,
  superAdminName,
}: {
  need: AdminRole;
  role: AdminRole;
  superAdminName: string;
}) {
  const router = useRouter();
  return (
    <LockGate
      need={need}
      role={role}
      superAdminName={superAdminName}
      onBack={() => router.back()}
    />
  );
}

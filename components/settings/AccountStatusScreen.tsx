"use client";

import { useRouter } from "next/navigation";
import { AccountStatus } from "@/components/profile/AccountStatus";

/**
 * Routed wrapper for the P9 account-status screen so the page itself can stay a
 * server component and keep its <title> (a "use client" page cannot export
 * metadata). Back returns to Settings, which is where this route is reached from.
 */
export function AccountStatusScreen({ base = "" }: { base?: string }) {
  const router = useRouter();
  return <AccountStatus onBack={() => router.push(`${base}/settings`)} />;
}

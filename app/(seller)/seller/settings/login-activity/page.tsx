import { LoginActivity } from "@/components";

/** P10 S9 — Login activity. Reached from Settings → Security → Login activity. */
export const metadata = { title: "Login activity" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SellerLoginActivityPage() {
  return <LoginActivity />;
}

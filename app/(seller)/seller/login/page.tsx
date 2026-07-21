import { AuthFlow } from "@/components/auth/AuthFlow";

/**
 * seller.homzlist.com/login — the P1 Auth & Entry flow (Module 1).
 * Full-screen, no bottom nav. Middleware seals the bypass (logged-in → home);
 * the flow silent-refreshes on splash to catch a valid-but-expired session.
 */
export const metadata = { title: "Sign in" };

export default function SellerLogin() {
  return <AuthFlow />;
}

import { AuthFlow } from "@/components/auth/AuthFlow";

/**
 * homzlist.com/login — the P1 Auth & Entry flow (Module 1), same component the
 * seller host uses.
 *
 * Why the public host needs its own login: session cookies are HOST-ONLY
 * (middleware §"per-subdomain isolation"), so a guest on homzlist.com must be
 * able to get a session ON homzlist.com — that is what makes save / inquire /
 * report work from the public feed. Every guest CTA here ("Sign in to save,
 * inquire and chat", the guest-gate sheet, profile sign-out) points at /login,
 * and on the public host that route did not exist → 404 (CLAUDE.md rule 10).
 * The logged-in bypass is sealed in middleware.ts, same as the other zones.
 */
export const metadata = { title: "Sign in" };

export default function PublicLogin() {
  return <AuthFlow />;
}

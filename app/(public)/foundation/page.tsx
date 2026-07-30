import { redirect } from "next/navigation";

/**
 * The Module-0 stand-in gallery lived here with a note that "the Component
 * Gallery lives in P12". P12 shipped it, so this route now forwards to the real
 * one instead of leaving two galleries to drift apart.
 */
export default function FoundationRedirect() {
  redirect("/components");
}

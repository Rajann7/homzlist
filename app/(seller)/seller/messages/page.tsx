import { redirect } from "next/navigation";

/**
 * /messages is now /leads.
 *
 * Chat was removed from the product; every connection lands in Leads. Old push
 * notifications, shared links and the installed PWA shortcut all still point
 * here, so this redirects rather than 404s.
 */
export const dynamic = "force-dynamic";

export default function MessagesRedirect() {
  redirect("/leads");
}

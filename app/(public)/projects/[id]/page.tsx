import { redirect } from "next/navigation";

/**
 * `/projects/:id` on the public host → the canonical `/project/:id`.
 *
 * The seller host serves project detail at `/projects/:id` (it is the plural
 * route group there) while the public site serves it at `/project/:id`. Any
 * link built once and rendered on both hosts — the Messages inbox card is the
 * first, and there will be more — would 404 for exactly half its audience.
 *
 * A redirect rather than a second copy of the page, so the public site keeps
 * one canonical project URL for search engines.
 */
export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  redirect(`/project/${params.id}`);
}

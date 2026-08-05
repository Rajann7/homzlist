import { RequirementDetail } from "@/components/listings/RequirementDetail";

/**
 * P4 S4 — public requirement detail (homzlist.com/requirements/:id).
 *
 * Requirement-mode feed cards tap through to `/requirements/:id`, but that route
 * existed only on the seller host — so on the public site every unlocked
 * requirement card was a 404 (CLAUDE.md rule 10, same class of gap as
 * `/project/:id`). Same component as the seller side; locked / unlocked / own is
 * decided server-side, so a guest still cannot see a budget.
 */
export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ id: string }> }) {
 const params = await props.params;
 // Public host = guest surface → billing CTAs gate to login (seller-only routes).
 return <RequirementDetail id={params.id} isGuest />;
}

import { notFound } from "next/navigation";
import { Placeholder } from "@/components/admin/panel/Placeholder";
import { SCREEN_ROUTES } from "@/components/admin/ds/screens";
import { SCREEN_TITLES, SCREEN_MIN_ROLE, ROLE_RANK } from "@/components/admin/ds/admin-context";
import { requireAdmin } from "@/lib/admin/guard";

/**
 * Every panel route P3-P7 has not built yet.
 *
 * The sidebar lists 27 screens and the dashboard deep-links to seven queues;
 * until those parts land, the links have to go somewhere real. The design ships
 * a screen for exactly this (template 951-957), so that is what they get — the
 * navigation stays honest and nothing dead-ends in a 404.
 *
 * A path that is NOT one of the design's screens still 404s: this is a
 * placeholder for work that is coming, not a catch-all that makes typos look
 * like features. And the role gate is applied here too, so a staff-level admin
 * cannot reach the Staff or Audit placeholder just because it is not built —
 * the rank required will not change when the real screen arrives.
 */
export const dynamic = "force-dynamic";

export default async function PanelPlaceholder({ params }: { params: { screen: string[] } }) {
  const me = await requireAdmin("staff");

  const path = `/account/${params.screen.join("/")}`;
  const entry = Object.entries(SCREEN_ROUTES).find(([, route]) => route === path);
  // A4 Review is a full screen addressed by listing id (`reviewRoute`), so it
  // has no entry of its own — the dashboard's overdue list and every queue row
  // link straight at it, and those must not 404 either.
  const screen =
    entry?.[0] ??
    (path.startsWith(`${SCREEN_ROUTES.listings}/`) ? "review" : null);
  if (!screen) notFound();
  const need = SCREEN_MIN_ROLE[screen];
  if (need && ROLE_RANK[me.role] < ROLE_RANK[need]) notFound();

  return <Placeholder title={`${SCREEN_TITLES[screen] ?? screen} — a later delivery batch`} />;
}

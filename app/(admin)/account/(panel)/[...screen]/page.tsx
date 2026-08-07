import { notFound } from "next/navigation";
import { Placeholder } from "@/components/admin/panel/Placeholder";
import {
  SCREEN_ROUTES,
  SCREEN_TITLES,
  SCREEN_MIN_ROLE,
  ROLE_RANK,
  type AdminRole,
} from "@/components/admin/ds/screens";
import { screenGate } from "@/lib/admin/screen-gate";

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
 * like features.
 */
export const dynamic = "force-dynamic";

export default async function PanelPlaceholder(props: { params: Promise<{ screen: string[] }> }) {
  const params = await props.params;
  const gate = await screenGate("staff");
  if (!gate.ok) return gate.lock;

  // The segments below /account are the BROWSER's path, which is what
  // SCREEN_ROUTES holds — `/account` itself is the rewrite target and never
  // part of a route key.
  const path = `/${params.screen.join("/")}`;
  const entry = Object.entries(SCREEN_ROUTES).find(([, route]) => route === path);
  // A4 Review is a full screen addressed by listing id (`reviewRoute`), so it
  // has no entry of its own — the dashboard's overdue list and every queue row
  // link straight at it, and those must not 404 either.
  const screen =
    entry?.[0] ??
    (path.startsWith(`${SCREEN_ROUTES.listings}/`) ? "review" : null);
  if (!screen) notFound();
  // The role gate is the SCREEN's, applied here too, so a Staff admin cannot
  // reach the Staff or Audit placeholder just because it is not built — the
  // rank required will not change when the real screen arrives. It answers
  // with the design's lock gate, not a 404: "you may not" and "there is no
  // such page" are different sentences, and the 404 was telling the wrong one.
  const need = SCREEN_MIN_ROLE[screen];
  if (need && ROLE_RANK[gate.me.role] < ROLE_RANK[need]) {
    const locked = await screenGate(need as AdminRole);
    if (!locked.ok) return locked.lock;
  }

  return <Placeholder title={`${SCREEN_TITLES[screen] ?? screen} — a later delivery batch`} />;
}

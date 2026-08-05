import type { IconName } from "@/components/ui/Icon";

/**
 * Per-type icon (Doc1 component gallery / designs/P5 S3).
 *
 * A DECORATIVE mapping keyed to the fixed set of type codes — not business
 * data, so it is safe client-side even though the type LIST itself always comes
 * from server config. Shared because two screens draw it (the P5 type picker
 * and the P2 feed's per-type rails); two copies is how one of them would
 * silently miss the next type code.
 *
 * A code with no icon here simply renders no icon — never a wrong one.
 */
export const TYPE_ICON: Record<string, IconName> = {
  flat: "type-flat",
  bungalow: "type-bungalow",
  tenement: "type-tenement",
  farmhouse: "type-farmhouse",
  office: "type-office",
  shop: "type-shop",
  showroom: "type-showroom",
  godown: "type-godown",
  plot_res: "type-plot-res",
  plot_com: "type-plot-com",
  plot_agri: "type-plot-agri",
  plot_farm: "type-plot-farm",
  pg: "type-pg",
};

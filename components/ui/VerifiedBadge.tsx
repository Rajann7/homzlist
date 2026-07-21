import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/**
 * VerifiedBadge — Doc1 Component 19. Three levels, 14px inline:
 *  phone → gray outline check · id → accent outline · rera → accent filled.
 * IMPORTANT (Doc2 rule): this means "Phone/ID/RERA verified" — NEVER "property
 * verified". Callers must use the correct level; label text is provided for a11y.
 */

type Level = "phone" | "id" | "rera";

const A11Y: Record<Level, string> = {
  phone: "Phone verified",
  id: "ID verified",
  rera: "RERA verified",
};

export function VerifiedBadge({ level, className }: { level: Level; className?: string }) {
  const filled = level === "rera";
  const color =
    level === "phone" ? "text-ink-tertiary" : "text-accent";
  return (
    <span
      className={cn("inline-flex items-center", color, className)}
      title={A11Y[level]}
      aria-label={A11Y[level]}
      role="img"
    >
      <Icon name="verified" size={14} filled={filled} strokeWidth={filled ? 0 : 1.5} />
    </span>
  );
}

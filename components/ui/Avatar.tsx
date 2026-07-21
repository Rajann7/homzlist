import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/**
 * Avatar — Doc1 Component 32. Sizes 24/32/48/64/84; image or initials on
 * accent-soft; fallback icon. Optional story ring (Doc1 §2 #7).
 */

type AvatarSize = 24 | 32 | 48 | 64 | 84;

export interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  ring?: "none" | "unseen" | "seen" | "project" | "boosted";
  className?: string;
  alt?: string;
}

const ringClass: Record<NonNullable<AvatarProps["ring"]>, string> = {
  none: "",
  unseen: "ring-2 ring-accent ring-offset-2 ring-offset-page",
  seen: "ring-2 ring-border ring-offset-2 ring-offset-page",
  project: "ring-2 ring-info ring-offset-2 ring-offset-page",
  boosted: "ring-2 ring-warning ring-offset-2 ring-offset-page",
};

function initials(name?: string) {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ src, name, size = 48, ring = "none", className, alt }: AvatarProps) {
  const dim = { width: size, height: size };
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft",
        ring !== "none" && ringClass[ring],
        className,
      )}
      style={dim}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? name ?? ""} width={size} height={size} className="h-full w-full object-cover" />
      ) : name ? (
        <span
          className="font-semibold text-accent"
          style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}
        >
          {initials(name)}
        </span>
      ) : (
        <Icon name="user" size={Math.round(size * 0.55)} className="text-accent" />
      )}
    </span>
  );
}

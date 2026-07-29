import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/**
 * Avatar — Doc1 Component 32. Sizes 24/32/48/64/84; image or initials on
 * accent-soft; fallback icon. Optional story ring (Doc1 §2 #7).
 */

type AvatarSize = 24 | 32 | 40 | 48 | 56 | 64 | 78 | 84;

export interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  ring?: "none" | "unseen" | "seen" | "project" | "boosted";
  className?: string;
  alt?: string;
}

// Doc1 §2 #7 — StoryCircle ring is a 2.5px GRADIENT (unseen: accent→warning;
// project: blue-tint; boosted: gold-tint), not a flat color — only "seen" is a
// plain ring (--border). A CSS `ring-*` box-shadow can't paint a gradient, so
// these render as a padded gradient-background wrapper around the avatar.
const ringGradient: Partial<Record<NonNullable<AvatarProps["ring"]>, string>> = {
  unseen: "var(--ring-unseen-grad)",
  project: "var(--ring-project-grad)",
  boosted: "var(--ring-boosted-grad)",
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

// Fallback-avatar tint cycles through the 4 soft tokens (Doc1 palette), keyed
// by name so the same person always lands on the same colour — matches
// designs/P7's list (green/blue/gold/pink avatars), not one flat colour.
const FALLBACK_TINTS = [
  { bg: "bg-accent-soft", fg: "text-accent" },
  { bg: "bg-info-soft", fg: "text-info" },
  { bg: "bg-warning-soft", fg: "text-warning" },
  { bg: "bg-error-soft", fg: "text-error" },
];
function fallbackTint(name?: string) {
  if (!name) return FALLBACK_TINTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return FALLBACK_TINTS[Math.abs(hash) % FALLBACK_TINTS.length];
}

export function Avatar({ src, name, size = 48, ring = "none", className, alt }: AvatarProps) {
  const dim = { width: size, height: size };
  const tint = fallbackTint(name);
  const inner = (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full", !src && tint.bg, ring === "none" && className)}
      style={dim}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? name ?? ""} width={size} height={size} className="h-full w-full object-cover" />
      ) : name ? (
        <span
          className={cn("font-semibold", tint.fg)}
          style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}
        >
          {initials(name)}
        </span>
      ) : (
        <Icon name="user" size={Math.round(size * 0.55)} className={tint.fg} />
      )}
    </span>
  );

  if (ring === "none") return inner;

  if (ring === "seen") {
    return (
      <span className={cn("inline-grid shrink-0 place-items-center rounded-full ring-2 ring-border ring-offset-2 ring-offset-page", className)}>
        {inner}
      </span>
    );
  }

  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full p-[2.5px]", className)}
      style={{ backgroundImage: ringGradient[ring] }}
    >
      <span className="inline-grid rounded-full bg-page p-[2px]">{inner}</span>
    </span>
  );
}

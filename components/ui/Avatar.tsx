import { cn } from "@/lib/utils";
import { Icon } from "./Icon";
import { AvatarPhoto } from "@/components/ui/AvatarPhoto";

/**
 * Avatar — Doc1 Component 32. Sizes 24/32/48/64/84; photo, or the Google-style
 * default picture (first letter, white, on a solid name-keyed circle); neutral
 * silhouette when there is no name either. Optional story ring (Doc1 §2 #7).
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

// Google-style default picture (Rajan, 10 Aug 2026): the FIRST letter of the
// name, white, on a solid circle — not two initials on a soft tint. `[...name]`
// rather than name[0] so a name starting with a non-BMP character (an emoji, a
// script outside the basic plane) yields the whole character, not half a
// surrogate pair. Exported (with avatarFill) so the one tile the design draws
// as a SQUARE rather than a circle — P4's "Posted by" card — shows the same
// letter on the same fill without a second copy of the rule.
export function avatarInitial(name?: string | null) {
  const trimmed = name?.trim();
  if (!trimmed) return "";
  return ([...trimmed][0] ?? "").toUpperCase();
}

// The fill is keyed by name so the same person is always the same colour — the
// property Google's avatar has that a single flat colour does not. Tokens only
// (globals.css `--avatar-*`); every one of them carries white text.
const FALLBACK_FILLS = [
  "bg-avatar-1",
  "bg-avatar-2",
  "bg-avatar-3",
  "bg-avatar-4",
  "bg-avatar-5",
  "bg-avatar-6",
  "bg-avatar-7",
  "bg-avatar-8",
];
export function avatarFill(name?: string | null) {
  let hash = 0;
  const key = name?.trim() ?? "";
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return FALLBACK_FILLS[Math.abs(hash) % FALLBACK_FILLS.length];
}

export function Avatar({ src, name, size = 48, ring = "none", className, alt }: AvatarProps) {
  const dim = { width: size, height: size };
  const letter = avatarInitial(name);

  // One layer, used both as the no-photo state and as what a photo sits on top
  // of (see AvatarPhoto). With no name at all — a guest, a deleted account —
  // there is no letter to draw, so it stays the neutral silhouette rather than
  // a coloured circle that means nothing.
  const fallback = (
    <span
      className={cn(
        "absolute inset-0 grid place-items-center rounded-full",
        letter ? avatarFill(name) : "bg-surface-3",
      )}
    >
      {letter ? (
        <span
          className="font-semibold leading-none text-ink-inverse"
          style={{ fontSize: Math.max(11, Math.round(size * 0.45)) }}
        >
          {letter}
        </span>
      ) : (
        <Icon name="user" size={Math.round(size * 0.55)} className="text-ink-tertiary" />
      )}
    </span>
  );

  const inner = (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full", ring === "none" && className)}
      style={dim}
    >
      {src ? <AvatarPhoto src={src} alt={alt ?? name ?? ""} size={size} fallback={fallback} /> : fallback}
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

import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge configured for our custom scales (Doc1). Without this, twMerge
 * doesn't recognise `text-15` etc. as font-sizes and collapses them with
 * `text-<color>` classes (dropping the size). Registering the custom groups
 * keeps size + colour independent, and radius/shadow tokens merge correctly.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["11", "13", "15", "17", "20", "24"] }],
      rounded: [{ rounded: ["4", "8", "12", "16"] }],
      shadow: [{ shadow: ["l1", "l2", "l3"] }],
    },
  },
});

/** Merge conditional class names, de-duplicating conflicting Tailwind classes. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Img } from "@/components/ui/Img";

/**
 * The photo half of <Avatar>, split out because it needs state and Avatar
 * itself is rendered from server components.
 *
 * Two things a bare <img> gets wrong for a profile picture, both of which the
 * Google-style letter avatar exists to cover:
 *
 *  · a photo URL that no longer resolves (an avatar deleted from the bucket, a
 *    row still pointing at an old host) painted the browser's broken-image
 *    glyph inside the circle. It now falls back to the letter, exactly as if no
 *    photo had ever been set.
 *  · while the photo is still downloading the circle was EMPTY — a blank hole
 *    in the feed on a slow connection. The letter sits behind the photo and the
 *    photo fades in over it, so an avatar is never nothing.
 *
 * The `complete` check is the same one Img makes, for the same reason: a photo
 * served from cache finishes before hydration, so neither onLoad nor onError is
 * coming. `naturalWidth === 0` on a complete image means it failed.
 */
export function AvatarPhoto({
  src,
  alt,
  size,
  fallback,
}: {
  src: string;
  alt: string;
  size: number;
  fallback: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const img = ref.current?.querySelector("img");
    if (img?.complete) setStatus(img.naturalWidth > 0 ? "ok" : "error");
  }, [src]);

  if (status === "error") return <>{fallback}</>;

  return (
    <span ref={ref} className="contents">
      {status !== "ok" && fallback}
      <Img
        src={src}
        alt={alt}
        width={size}
        height={size}
        // `absolute inset-0` rather than `h-full w-full`: as a centred grid item
        // the percentage height was resolving against the image's own intrinsic
        // ratio instead of the circle, so a portrait photo rendered into a box
        // TALLER than the avatar and object-cover then cropped from a box the
        // circle only partly showed. Pinned to the (relative) circle, the cover
        // crop is computed against the circle itself — which is what it was
        // always meant to be. Same size, same round shape, correct centring.
        className="absolute inset-0 h-full w-full object-cover"
        onLoad={() => setStatus("ok")}
        onError={() => setStatus("error")}
      />
    </span>
  );
}

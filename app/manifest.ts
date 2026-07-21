import type { MetadataRoute } from "next";

/**
 * PWA manifest (Doc6 §8). HomzList placeholder brand — admin-changeable later
 * (Doc1 §12 / Doc7 §181 branding). Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HomzList",
    short_name: "HomzList",
    description: "Properties without spam calls — Instagram-style real estate listings.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0F9D58", // accent
    categories: ["business", "shopping", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Search", short_name: "Search", url: "/search" },
      { name: "Create listing", short_name: "Create", url: "/create" },
      { name: "Saved", short_name: "Saved", url: "/saved" },
    ],
  };
}

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
    // Doc3 §98 names these exactly: New listing / Messages / Search. "Saved" was
    // here instead of Messages, so the one shortcut a seller actually needs from
    // the home screen — an unread conversation — wasn't reachable.
    // Every entry carries an icon; Android drops icon-less shortcuts from the
    // long-press menu on some launchers.
    shortcuts: [
      { name: "New listing", short_name: "New listing", url: "/create", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Messages", short_name: "Messages", url: "/messages", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Search", short_name: "Search", url: "/search", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}

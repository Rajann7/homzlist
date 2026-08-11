import type { MetadataRoute } from "next";
import { getBranding } from "@/lib/branding/service";

/**
 * PWA manifest (Doc6 §8). Served at /manifest.webmanifest.
 *
 * The name and description come from `branding_settings` (Doc1 §12 / Doc7 §181)
 * rather than from literals here — the admin's Branding tab has always written
 * those rows, and until 9 Aug 2026 nothing read them. This is its own route, so
 * reading the DB costs nothing that page rendering pays for.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { appName, tagline } = await getBranding();
  return {
    name: appName,
    short_name: appName,
    description: `${tagline} — browse flats, plots and projects from owners, brokers and builders.`,
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
      { name: "Leads", short_name: "Leads", url: "/leads", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Search", short_name: "Search", url: "/search", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}

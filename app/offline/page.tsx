import { OfflineScreen } from "@/components/system/OfflineScreen";

/**
 * P12 S7 — the offline fallback, served by the service worker when a navigation
 * fails with no cached page (Doc1 §10 / Doc6 §8).
 *
 * Static: no server data is fetched, because by definition nothing can be. The
 * "Recently viewed" rail reads the service worker's own Cache Storage on the
 * client and is simply absent when that cache is empty — three placeholder
 * cards on an offline screen would be inventing property that does not exist.
 */
export const metadata = { title: "Offline", robots: { index: false, follow: false } };

export default function OfflinePage() {
  return <OfflineScreen />;
}

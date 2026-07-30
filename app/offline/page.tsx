import { OfflineView } from "@/components/system/OfflineView";

/**
 * P12 S7 — the offline fallback the service worker serves when a navigation
 * fails with no cached page. Rebuilt to the design: retry with its spinner, the
 * cached "Recently viewed" rail, and the sync note.
 */
export const metadata = { title: "Offline", robots: { index: false, follow: false } };

export default function OfflinePage() {
  return <OfflineView />;
}

"use client";

import { useEffect, useState } from "react";
import { GlobalOfflineBanner } from "@/components/system/OfflineBanner";
import { drain } from "@/lib/pwa/offline-queue";

/**
 * Connectivity for the whole app shell (Doc3 §98 "network-failure handling on
 * every action"). Two jobs:
 *
 *  1. Draw the P12 offline banner while the device reports no connection. Until
 *     now only the auth flow and three billing screens knew about the network;
 *     every other screen just silently failed.
 *  2. Drain the offline write-queue the moment the connection returns — and on
 *     mount, which is what catches the case where the browser came back while
 *     the app was closed and Background Sync isn't available (Safari).
 *
 * `navigator.onLine` is trusted only in the NEGATIVE direction: false is a hard
 * "no radio", true only means "an interface exists". So the banner appears on
 * `offline` and disappears on `online`, and nothing here decides whether a
 * request will actually succeed — the request itself does.
 */
export function NetworkStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    const onOnline = () => { sync(); void drain(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", sync);
    // Anything queued by a previous session goes out as soon as we are up.
    if (navigator.onLine) void drain();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return offline ? <GlobalOfflineBanner /> : null;
}

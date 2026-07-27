/**
 * Browser / OS naming — used by the new-device-login notification
 * ("Chrome on Windows") and by device-aware push registration.
 *
 * Deliberately small and dependency-free. Order matters: Edge and Opera both
 * claim to be Chrome, and Chrome claims to be Safari, so the more specific
 * token has to be tested first or every browser reads as "Chrome".
 *
 * No fingerprinting: only the coarse browser + OS name is kept, never the full
 * UA string in the visible copy.
 */

export interface DeviceInfo {
  browser: string;
  os: string;
  /** "Chrome on Windows" */
  label: string;
  /** iOS Safari cannot receive web push unless the PWA is INSTALLED. */
  iosWebPushNeedsInstall: boolean;
}

export function describeUserAgent(ua: string): DeviceInfo {
  const s = ua ?? "";
  const browser =
    /Edg\//i.test(s) ? "Edge"
    : /OPR\/|Opera/i.test(s) ? "Opera"
    : /SamsungBrowser/i.test(s) ? "Samsung Internet"
    : /Firefox\//i.test(s) ? "Firefox"
    : /Chrome\//i.test(s) ? "Chrome"
    : /Safari\//i.test(s) ? "Safari"
    : "Browser";

  const os =
    /Windows NT/i.test(s) ? "Windows"
    : /Android/i.test(s) ? "Android"
    : /iPhone|iPad|iPod/i.test(s) ? "iOS"
    : /Mac OS X/i.test(s) ? "macOS"
    : /Linux/i.test(s) ? "Linux"
    : "device";

  // A client that sent no (or an unreadable) UA must not be described as
  // "Browser on device" — that reads like a product name. Say what is true.
  const unknownBrowser = browser === "Browser";
  const unknownOs = os === "device";
  const label =
    unknownBrowser && unknownOs ? "an unrecognised device"
    : unknownBrowser ? `a browser on ${os}`
    : unknownOs ? browser
    : `${browser} on ${os}`;

  return { browser, os, label, iosWebPushNeedsInstall: os === "iOS" };
}

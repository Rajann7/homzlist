/**
 * Two display helpers the design's own copy implies, kept in one place so no
 * screen invents its own version.
 *
 * The design writes "103.21.xx.xx · Chrome/Mac" (template 1595) — an IP with
 * its last two octets already hidden and a user-agent boiled down to two words.
 * That is not decoration: Doc9 §19 treats a raw IP as identifying, and a
 * full user-agent string is a fingerprint. Both are stored in full on the
 * session row for a real investigation; neither is rendered in full.
 */

/** 103.21.44.9 → 103.21.xx.xx. IPv6 keeps its first two groups. */
export function maskIpForDisplay(ip: string): string {
  if (ip.includes(":")) {
    const groups = ip.split(":").filter(Boolean);
    // Compressed forms (and loopback "::1") have nothing safe to keep.
    if (groups.length < 3) return "xx:xx:xx";
    return `${groups.slice(0, 2).join(":")}:xx:xx`;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return "xx.xx.xx.xx";
  return `${parts[0]}.${parts[1]}.xx.xx`;
}

const BROWSERS: [RegExp, string][] = [
  [/edg/i, "Edge"],
  [/chrome|crios/i, "Chrome"],
  [/firefox|fxios/i, "Firefox"],
  [/safari/i, "Safari"],
];

const PLATFORMS: [RegExp, string][] = [
  [/android/i, "Android"],
  [/iphone|ipad|ios/i, "iOS"],
  [/mac os|macintosh/i, "Mac"],
  [/windows/i, "Windows"],
  [/linux/i, "Linux"],
];

/** A user-agent as the design writes it: "Chrome/Mac". */
export function shortDevice(userAgent: string): string {
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1] ?? "Browser";
  const platform = PLATFORMS.find(([re]) => re.test(userAgent))?.[1];
  return platform ? `${browser}/${platform}` : browser;
}

"use client";

import { publicEnv } from "@/lib/env";
import { notificationsApi } from "./client";

/**
 * Device push registration (Doc2 §14 channel 1 — FCM).
 *
 * Device/browser-aware by design, because web push is NOT uniform:
 *   · Android + desktop Chrome/Edge/Firefox — works in a normal tab.
 *   · iOS Safari — delivers ONLY to a PWA installed to the Home Screen. In a
 *     normal iOS tab `Notification` often does not exist at all, so we say so
 *     rather than showing a permission prompt that can never succeed.
 *   · Any browser where the user already denied — the spec forbids re-prompting,
 *     so the screen explains the manual steps instead of a dead button.
 *
 * The token is minted by the Firebase messaging SDK against OUR service worker
 * registration (public/sw.js), so there is one SW handling both caching and
 * push. Without the public Firebase config this reports `unavailable` and
 * stores nothing — never a fake success.
 */

export interface PushState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  standalone: boolean;
  /** iOS in a browser tab: must install the PWA before push can work at all. */
  iosNeedsInstall: boolean;
  configured: boolean;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function pushConfigured(): boolean {
  return Boolean(
    publicEnv.firebaseApiKey && publicEnv.firebaseProjectId &&
    publicEnv.firebaseAppId && publicEnv.fcmSenderId && publicEnv.fcmVapidKey,
  );
}

export function pushState(): PushState {
  const standalone = isStandalone();
  const hasApi = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  return {
    supported: hasApi,
    permission: hasApi ? Notification.permission : "unsupported",
    standalone,
    iosNeedsInstall: isIOS() && !standalone,
    configured: pushConfigured(),
  };
}

/**
 * Ask for permission and register this device. Returns a reason on every
 * failure path so the caller can say something true instead of "try again".
 */
export async function enablePush(): Promise<{ ok: boolean; reason?: string; device?: string }> {
  const s = pushState();
  if (s.iosNeedsInstall) return { ok: false, reason: "Add HomzList to your Home Screen first — iOS only delivers notifications to an installed app." };
  if (!s.supported) return { ok: false, reason: "This browser can't receive notifications." };
  if (!s.configured) return { ok: false, reason: "Push isn't configured on this environment yet." };

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission === "denied") return { ok: false, reason: "Notifications are blocked in your browser settings." };
  if (permission !== "granted") return { ok: false, reason: "Permission wasn't granted." };

  try {
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;

    // Loaded lazily so the messaging SDK never lands in the initial bundle.
    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return { ok: false, reason: "This browser can't receive notifications." };

    const app = getApps().length
      ? getApp()
      : initializeApp({
          apiKey: publicEnv.firebaseApiKey,
          projectId: publicEnv.firebaseProjectId,
          appId: publicEnv.firebaseAppId,
          messagingSenderId: publicEnv.fcmSenderId,
        });

    const token = await getToken(getMessaging(app), {
      vapidKey: publicEnv.fcmVapidKey,
      serviceWorkerRegistration: reg,
    });
    if (!token) return { ok: false, reason: "Couldn't get a device token." };

    const platform = isIOS() ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "web";
    const res = await notificationsApi.registerPush(token, platform, s.standalone);
    if (!res.ok) return { ok: false, reason: "Couldn't save this device." };
    // Remembering the token locally is a UI convenience only (so we can
    // unregister it later) — it is not business data, and the server's
    // push_tokens row is the truth.
    try { localStorage.setItem("hz_push_token", token); } catch { /* private mode */ }
    return { ok: true, device: res.data.device };
  } catch {
    return { ok: false, reason: "Couldn't register this device for notifications." };
  }
}

/** Drop this device's registration (sign-out, or the user turning push off). */
export async function disablePush(): Promise<void> {
  let token: string | null = null;
  try { token = localStorage.getItem("hz_push_token"); } catch { /* private mode */ }
  if (!token) return;
  await notificationsApi.unregisterPush(token);
  try { localStorage.removeItem("hz_push_token"); } catch { /* ignore */ }
}

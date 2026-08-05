"use client";

/**
 * The avatar dropdown — template 1580-1583. Three rows, the third in red.
 *
 * The design anchors it at top:56 right:12 with a 220px width; `TopDrop` is
 * that surface. Each row opens the thing it names: two right sheets and a real
 * sign-out that ends the session server-side before the browser goes anywhere.
 */

import { useState } from "react";
import { TopDrop } from "@/components/admin/ds";

export function AvatarMenu({
  onClose,
  onMyProfile,
  onSwitchAccount,
}: {
  onClose: () => void;
  onMyProfile: () => void;
  onSwitchAccount: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function logOut() {
    if (signingOut) return;
    setSigningOut(true);
    await fetch("/api/v1/admin/auth/logout", { method: "POST", cache: "no-store" }).catch(
      () => null,
    );
    // A full navigation, not a router push: every cookie, every cached server
    // payload and every piece of panel state belongs to a session that is gone.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The session identity changes here, so this has to be a real page load — router.push() would keep the previous user's client cache and rendered tree.
    window.location.assign("/login");
  }

  const items: [string, () => void, boolean][] = [
    ["My profile", onMyProfile, false],
    ["Switch account", onSwitchAccount, false],
    [signingOut ? "Logging out…" : "Log out", logOut, true],
  ];

  return (
    <TopDrop onClose={onClose} right={12} top={56} width={220}>
      <div style={{ padding: 6 }}>
        {items.map(([label, onSelect, danger]) => (
          <div
            key={label}
            onClick={onSelect}
            style={{
              padding: "10px 12px",
              fontSize: 14,
              color: danger ? "var(--error)" : "var(--ink1)",
              cursor: "pointer",
              borderRadius: 8,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </TopDrop>
  );
}

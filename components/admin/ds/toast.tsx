"use client";

/** template 170-172 — the panel's single toast. 3s, bottom-centred, z 120. */

import { AdminIcon } from "./icons";
import { useAdmin } from "./admin-context";

export function AdminToast() {
  const { toastMessage } = useAdmin();
  if (!toastMessage) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 76,
        transform: "translateX(-50%)",
        zIndex: 120,
        background: "var(--ink1)",
        color: "var(--page)",
        fontSize: 13,
        fontWeight: 600,
        padding: "12px 16px",
        borderRadius: 8,
        boxShadow: "var(--L3)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        animation: "toastIn .2s ease",
        maxWidth: "90%",
      }}
    >
      <span style={{ color: "var(--accent)" }}>
        <AdminIcon name="check" size={16} />
      </span>
      {toastMessage}
    </div>
  );
}

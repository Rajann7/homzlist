"use client";

/**
 * template 951-957 — the design's own "later delivery batch" screen.
 *
 * The dashboard deep-links to every queue, and the sidebar lists all 27
 * screens. Most of them land in P3-P7, so between now and then those links have
 * to go somewhere. The design already answers that question, and this is its
 * answer, verbatim — not a 404, and not an invented stub.
 */

import { useRouter } from "next/navigation";
import { AdminIcon } from "@/components/admin/ds";

export function Placeholder({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "80px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "var(--s2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink3)",
        }}
      >
        <AdminIcon name="wrench" size={28} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink1)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--ink2)", maxWidth: 340 }}>
        This module is part of a later delivery batch. The navigation and shell are fully
        wired.
      </div>
      <button
        type="button"
        onClick={() => router.back()}
        style={{
          marginTop: 8,
          height: 40,
          padding: "0 18px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--s1)",
          color: "var(--ink1)",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Go back
      </button>
    </div>
  );
}

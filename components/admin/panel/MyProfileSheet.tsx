"use client";

/**
 * "My profile" — template 1585-1596. A right sheet with the admin's own
 * details, two preference switches, a read-only security block, and a link to
 * their audit trail.
 *
 * Every writable control here writes: name and phone go to `staff`, both
 * switches go to `staff.notify_escalations` / `staff.daily_digest`. The
 * read-only ones are read-only for a reason the endpoint enforces too — email
 * comes from Google, and the role is the whitelist, editable only from A25 by a
 * super admin. Cancel discards; nothing is saved until Save is pressed, which
 * is what the design's two-button footer promises.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Badge,
  Btn,
  FField,
  F_INPUT_STYLE,
  PSecH,
  RightSheet,
  RoleChip,
  Switch,
  AdminIcon,
  SCREEN_ROUTES,
  useToast,
  useAdmin,
} from "@/components/admin/ds";
import type { AdminProfile } from "@/lib/admin/panel";

const ROLE_LABEL = { super: "Super Admin", admin: "Admin", staff: "Staff" } as const;

export function MyProfileSheet({
  profile,
  onClose,
}: {
  profile: AdminProfile;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { me } = useAdmin();

  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [escalations, setEscalations] = useState(profile.notifyEscalations);
  const [digest, setDigest] = useState(profile.dailyDigest);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    const res = await fetch("/api/v1/admin/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        displayName: name,
        phone,
        notifyEscalations: escalations,
        dailyDigest: digest,
      }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    setSaving(false);
    if (!body?.ok) {
      toast(res.status === 422 ? "Check the name and phone number" : "Could not save — try again");
      return;
    }
    // Refresh first: `onClose` unmounts this sheet, and a refresh asked for
    // after that never runs — the header would keep the old display name.
    router.refresh();
    onClose();
    toast("Profile updated");
  }

  return (
    <RightSheet
      title="My profile"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={saving ? "Saving…" : "Save changes"}
            kind="primary"
            onClick={save}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <Avatar initials={profile.initials} size={56} />
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{profile.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink3)" }}>{profile.email}</div>
          <div style={{ marginTop: 4 }}>
            <RoleChip role={ROLE_LABEL[profile.role]} />
          </div>
        </div>
      </div>

      <FField label="Display name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          style={F_INPUT_STYLE}
        />
      </FField>

      <FField label="Email">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 40,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--s3)",
            color: "var(--ink3)",
            fontSize: 14,
          }}
        >
          {profile.email}
          <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0 }}>
            Google
          </Badge>
        </div>
      </FField>

      <FField label="Phone">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="+91 98250 12345"
          style={F_INPUT_STYLE}
        />
      </FField>

      <PSecH>Preferences</PSecH>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
        <Switch on={escalations} onClick={() => setEscalations((v) => !v)} />
        <span style={{ fontSize: 13, flex: 1 }}>Email me on escalations</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
        <Switch on={digest} onClick={() => setDigest((v) => !v)} />
        <span style={{ fontSize: 13, flex: 1 }}>Daily queue digest</span>
      </div>

      <PSecH>Security</PSecH>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "var(--ink2)",
          padding: "6px 0",
        }}
      >
        <span style={{ color: "var(--accent)", display: "flex" }}>
          <AdminIcon name="check" size={16} />
        </span>
        2-step verification on (Google)
      </div>
      <div style={{ fontSize: 12, color: "var(--ink3)", padding: "4px 0" }}>
        {`Last login: ${profile.lastLogin}`}
      </div>
      {/* A26 is super-only; below that rank the design's own gate applies. */}
      {me.role === "super" ? (
        <Btn
          label="View my audit trail"
          kind="outline"
          onClick={() => {
            onClose();
            router.push(`${SCREEN_ROUTES.audit}?admin=${me.id}`);
          }}
          style={{ height: 34, fontSize: 13, marginTop: 6 }}
        />
      ) : null}
    </RightSheet>
  );
}

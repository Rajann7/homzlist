"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { uploadProfileMedia, profileApi } from "@/lib/profile/client";
import { cn } from "@/lib/utils";

/**
 * S4 Verification (P9). Intro card · Phone (verified) · ID (not-started/pending/
 * approved/rejected + doc sheet + upload) · RERA (Broker/Builder + input + cert +
 * pending/approved/revoked) · footer disclaimer. NEVER says "property verified"
 * (Doc2 §11). Doc upload UI is present; the private-R2 upload wires with storage.
 */
type Status = "not_started" | "pending" | "approved" | "rejected" | "revoked";
interface VState {
  phone: { status: Status; reviewed_at: string | null };
  id: { status: Status; reason: string | null; reviewed_at: string | null; doc_type: string | null };
  rera: { status: Status; reason: string | null; rera_number: string | null; valid_till: string | null };
}

const DOC_TYPES = [
  { v: "aadhaar", l: "Aadhaar" },
  { v: "pan", l: "PAN" },
  { v: "driving_licence", l: "Driving licence" },
  { v: "property_tax", l: "Property tax receipt" },
  { v: "index_copy", l: "Index copy" },
  { v: "electricity_bill", l: "Electricity bill" },
];

export function Verification() {
  const router = useRouter();
  const { show } = useToast();
  const [v, setV] = useState<VState | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState("");
  const [docType, setDocType] = useState<string | null>(null);
  const [docSheet, setDocSheet] = useState(false);
  const [rera, setRera] = useState("");
  const [busy, setBusy] = useState(false);
  // Uploaded doc keys. These are PRIVATE bucket keys, never public URLs — the
  // file is only ever retrievable through a short-lived signed URL (Doc2 §5.1).
  const [idDocKey, setIdDocKey] = useState<string | null>(null);
  const [reraDocKey, setReraDocKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"id" | "rera" | null>(null);
  const idFileRef = useRef<HTMLInputElement>(null);
  const reraFileRef = useRef<HTMLInputElement>(null);

  /** Shared picker handler: upload to the private bucket, keep the key. */
  async function pickDoc(which: "id" | "rera", file: File | undefined) {
    if (!file) return;
    setUploading(which);
    const res = await uploadProfileMedia("doc", file);
    setUploading(null);
    if (!res.ok) return show(res.error);
    if (which === "id") setIdDocKey(res.key ?? null);
    else setReraDocKey(res.key ?? null);
    show("Document attached");
  }

  async function load() {
    const [meR, vR] = await Promise.all([profileApi.me(), profileApi.verificationStatus()]);
    if (meR.ok) {
      setRole(meR.data.profile.role);
      setPhoneMasked(meR.data.profile.phoneMasked);
    }
    if (vR.ok) setV(vR.data.verification);
  }
  useEffect(() => {
    load();
  }, []);

  async function submitId() {
    if (!docType || busy) return;
    setBusy(true);
    const r = await profileApi.submitId(docType, idDocKey);
    setBusy(false);
    if (r.ok) {
      show("Submitted for verification");
      load();
    } else show("Couldn't submit. Please try again.");
  }
  async function submitRera() {
    if (rera.trim().length < 6 || busy) return;
    setBusy(true);
    const r = await profileApi.submitRera(rera.trim(), reraDocKey);
    setBusy(false);
    if (r.ok) {
      show("Submitted for verification");
      load();
    } else show("Couldn't submit. Please try again.");
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page">
      <header className="chrome sticky top-0 z-header flex h-header items-center gap-2 border-b border-border bg-surface-1 px-4">
        <button aria-label="Back" onClick={() => router.back()} className="grid h-11 w-11 -ml-2 place-items-center text-ink-primary">
          <Icon name="arrow-left" size={24} strokeWidth={1.7} />
        </button>
        <h1 className="text-17 font-semibold text-ink-primary">Verification</h1>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <p className="rounded-8 bg-surface-2 p-3 text-13 text-ink-secondary">Verified sellers get more genuine inquiries. Verification is free.</p>

        {!v ? (
          <>
            <Skeleton className="h-24 w-full rounded-12" />
            <Skeleton className="h-40 w-full rounded-12" />
          </>
        ) : (
          <>
            {/* Phone */}
            <div className="flex items-start gap-3 rounded-12 bg-accent-soft p-4">
              <Icon name="verified" size={32} className="shrink-0 text-ink-tertiary" strokeWidth={1.5} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-15 font-semibold text-ink-primary">Phone verified</span>
                  <span className="chrome rounded-4 bg-accent-soft px-2 py-0.5 text-11 font-semibold uppercase tracking-[0.3px] text-accent">Verified ✓</span>
                </div>
                <p className="mt-0.5 text-13 text-ink-tertiary">{phoneMasked}</p>
              </div>
            </div>

            {/* ID */}
            <LevelCard iconLevel="id" title="ID verification" desc="Upload a government ID or property document">
              {v.id.status === "approved" ? (
                <Chip label={`Verified ✓${v.id.reviewed_at ? ` · ${fmtDate(v.id.reviewed_at)}` : ""}`} />
              ) : v.id.status === "pending" ? (
                <Strip tone="info" icon="alert" text="Under review — usually within 24 hours" action={{ label: "Cancel request", onClick: async () => { const r = await profileApi.cancelVerification("id"); if (r.ok) { show("Request cancelled"); void load(); } else show("Couldn't cancel that"); } }} />
              ) : (
                <>
                  {v.id.status === "rejected" && <Strip tone="error" icon="alert" text={`Rejected: ${v.id.reason ?? "Please re-upload"}`} />}
                  <button onClick={() => setDocSheet(true)} className="mt-2 flex h-11 items-center justify-between rounded-8 border border-border bg-surface-2 px-3 text-left text-15">
                    <span className={docType ? "text-ink-primary" : "text-ink-tertiary"}>{docType ? DOC_TYPES.find((d) => d.v === docType)?.l : "Select document type"}</span>
                    <Icon name="chevron-right" size={18} className="text-ink-tertiary" strokeWidth={1.7} />
                  </button>
                  <UploadTile
                    onClick={() => idFileRef.current?.click()}
                    label={idDocKey ? "Document attached ✓" : "Upload document"}
                    busy={uploading === "id"}
                    done={!!idDocKey}
                  />
                  <input
                    ref={idFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    hidden
                    onChange={(e) => { void pickDoc("id", e.target.files?.[0]); e.target.value = ""; }}
                  />
                  <Button className="mt-3" fullWidth loading={busy} disabled={!docType || !idDocKey} onClick={submitId}>
                    {v.id.status === "rejected" ? "Try again" : "Submit for verification"}
                  </Button>
                </>
              )}
            </LevelCard>

            {/* RERA — Broker/Builder only */}
            {(role === "broker" || role === "builder") && (
              <LevelCard iconLevel="rera" title="RERA verification" desc="Add your RERA number to get the verified badge">
                {v.rera.status === "approved" ? (
                  <div className="flex items-center gap-2">
                    <Chip label="RERA verified ✓" />
                    {v.rera.valid_till && <span className="text-11 text-ink-tertiary">Valid till {fmtDate(v.rera.valid_till)}</span>}
                  </div>
                ) : v.rera.status === "pending" ? (
                  <Strip tone="info" icon="alert" text="Under review — usually within 24 hours" />
                ) : (
                  <>
                    {v.rera.status === "revoked" && <Strip tone="error" icon="alert" text={`Your RERA verification was revoked${v.rera.reason ? ` — reason: ${v.rera.reason}` : ""}.`} />}
                    <Input value={rera} onChange={(e) => setRera(e.target.value)} placeholder="RERA number" hint="e.g. PR/GJ/RAJKOT/RAJKOT/Others/MAA12345/240424" />
                    <UploadTile
                      onClick={() => reraFileRef.current?.click()}
                      label={reraDocKey ? "Certificate attached ✓" : "Upload RERA certificate"}
                      busy={uploading === "rera"}
                      done={!!reraDocKey}
                    />
                    <input
                      ref={reraFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      hidden
                      onChange={(e) => { void pickDoc("rera", e.target.files?.[0]); e.target.value = ""; }}
                    />
                    <Button className="mt-3" fullWidth loading={busy} disabled={rera.trim().length < 6} onClick={submitRera}>
                      {v.rera.status === "revoked" ? "Re-submit" : "Submit"}
                    </Button>
                  </>
                )}
              </LevelCard>
            )}

            <p className="rounded-8 bg-surface-2 p-3 text-11 text-ink-tertiary">
              HomzList verifies identity and RERA registration only. We do not verify property titles or guarantee listings.
            </p>
          </>
        )}
      </div>

      {/* Doc-type sheet */}
      <BottomSheet open={docSheet} onClose={() => setDocSheet(false)} title="Document type">
        <div className="flex flex-col">
          {DOC_TYPES.map((d) => (
            <button
              key={d.v}
              onClick={() => {
                setDocType(d.v);
                setDocSheet(false);
              }}
              className={cn("flex h-12 items-center justify-between text-left text-15", docType === d.v ? "text-accent" : "text-ink-primary")}
            >
              {d.l}
              {docType === d.v && <Icon name="check" size={18} className="text-accent" strokeWidth={2} />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function LevelCard({ iconLevel, title, desc, children }: { iconLevel: "id" | "rera"; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-12 border border-border p-4">
      <div className="flex items-start gap-3">
        <Icon name="verified" size={28} filled={iconLevel === "rera"} className="shrink-0 text-accent" strokeWidth={iconLevel === "rera" ? 0 : 1.5} />
        <div className="flex-1">
          <span className="text-15 font-semibold text-ink-primary">{title}</span>
          <p className="mt-0.5 text-13 text-ink-secondary">{desc}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return <span className="chrome inline-flex rounded-4 bg-accent-soft px-2 py-0.5 text-11 font-semibold uppercase tracking-[0.3px] text-accent">{label}</span>;
}

function Strip({ tone, icon, text, action }: { tone: "info" | "error"; icon: "alert"; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-8 p-3 text-13", tone === "info" ? "bg-info-soft text-info" : "bg-error-soft text-error")}>
      <Icon name={icon} size={16} strokeWidth={1.7} />
      <span className="flex-1">{text}</span>
      {action && (
        <button onClick={action.onClick} className="font-semibold text-accent">
          {action.label}
        </button>
      )}
    </div>
  );
}

function UploadTile({ onClick, label = "Upload document", busy, done }: { onClick: () => void; label?: string; busy?: boolean; done?: boolean }) {
  return (
    <button onClick={onClick} className="mt-2 flex w-full flex-col items-center gap-1 rounded-8 border border-dashed border-border py-5 text-center">
      <Icon name="image" size={24} className="text-ink-tertiary" strokeWidth={1.7} />
      <span className="text-13 font-medium text-ink-primary">{label}</span>
      <span className="text-11 text-ink-tertiary">PDF or JPG · Only visible to HomzList admins</span>
    </button>
  );
}

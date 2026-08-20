"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Icon } from "@/components/ui/Icon";
import { CitySheet, type City } from "@/components/auth/CitySheet";
import { PhotoSheet } from "@/components/auth/PhotoSheet";
import { authApi, friendlyError } from "@/lib/auth/client";
import { uploadProfileMedia, removeProfilePhoto } from "@/lib/profile/client";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * S7 Basic Details (P1, pixel-exact). Title 24/700 · avatar 84px dashed circle
 * + camera → "Add photo" 11 #8E8E8E below · name · email (optional) · city
 * selector row · 18+ + DPDP checks (13 #555) · "Start Exploring" (disabled until
 * name + city + both checks).
 *
 * The photo really uploads here: presign → PUT → commit writes profiles.photo_url
 * server-side inside the register-cookie window, so re-picking replaces it and
 * "Remove photo" clears the column. Nothing about the photo is client-truth.
 */
export function Details({ role, onBack, onDone }: { role: string; onBack: () => void; onDone: (user?: unknown, cityName?: string) => void }) {
  const { show } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [age18, setAge18] = useState(false);
  const [dpdp, setDpdp] = useState(false);
  const [citySheet, setCitySheet] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSubmit = name.trim().length >= 2 && !!city && age18 && dpdp;

  async function pickFile(file: File) {
    setUploading(true);
    const res = await uploadProfileMedia("avatar", file);
    setUploading(false);
    if (res.ok) {
      // Cache-bust so a replacement photo is visibly the new one.
      setPhotoUrl(res.url ? `${res.url}?v=${Date.now()}` : null);
      show("Photo updated");
    } else show(res.error);
  }

  async function submit() {
    if (!canSubmit || loading) return;
    setLoading(true);
    setNameError(null);
    setEmailError(null);
    const res = await authApi.register({ role, name: name.trim(), cityId: city!.id, email: email.trim() || null, consent18: age18, consentDpdp: dpdp });
    setLoading(false);
    if (res.ok) onDone((res.data as any).user, city!.name);
    else if (res.error.code === "VALIDATION_ERROR" && res.error.field === "name") setNameError("Please enter your full name.");
    else if (res.error.code === "VALIDATION_ERROR" && res.error.field === "email") setEmailError("Enter a valid email address.");
    else show(friendlyError(res.error));
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page px-4 md:min-h-0 md:bg-transparent md:px-0">
      <div className="mt-6 flex items-center gap-3 md:mt-0">
        <button aria-label="Back" onClick={onBack} className="grid h-11 w-11 -ml-2 place-items-center text-ink-primary">
          <Icon name="arrow-left" size={24} strokeWidth={1.7} />
        </button>
        <div className="flex gap-2">
          <span className="h-1 w-5 rounded-full bg-surface-3" />
          <span className="h-1 w-5 rounded-full bg-accent" />
        </div>
      </div>

      <h1 className="mt-4 text-24 font-bold text-ink-primary">Set up your profile</h1>

      {/* Avatar uploader + Add photo (P1 S7) */}
      <div className="mt-6 flex flex-col items-center gap-1 self-center">
        <button onClick={() => setPhotoSheet(true)} disabled={uploading} className="flex flex-col items-center gap-2">
          <span className={cn("grid h-[84px] w-[84px] place-items-center overflow-hidden rounded-full", photoUrl ? "" : "border-2 border-dashed border-border")}>
            {uploading ? (
              <Spinner size={22} className="text-accent" />
            ) : photoUrl ? (
              <Img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name="camera" size={26} className="text-ink-tertiary" strokeWidth={1.7} />
            )}
          </span>
          <span className="chrome text-11 text-ink-tertiary">{uploading ? "Uploading…" : photoUrl ? "Change photo" : "Add photo"}</span>
        </button>
        {/* One hidden picker drives both sheet actions; `capture` is set per-action
            so "Take photo" opens the camera and "Choose from gallery" doesn't. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) await pickFile(file);
          }}
        />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Input id="details-name" label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rupal Kachhadiya" error={nameError ?? undefined} maxLength={60} autoComplete="name" />

        <Input
          id="details-email"
          label="Email"
          type="email"
          optional
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
          placeholder="you@example.com"
          error={emailError ?? undefined}
          hint="For invoices and important updates only. You can't log in with email."
          maxLength={254}
          autoComplete="email"
          inputMode="email"
        />

        <div className="flex flex-col gap-2">
          <label className="chrome text-13 font-semibold text-ink-secondary">City</label>
          <button onClick={() => setCitySheet(true)} className="flex h-11 items-center gap-2 rounded-8 border border-border bg-surface-2 px-3 text-left">
            <Icon name="pin" size={20} className="text-ink-tertiary" strokeWidth={1.7} />
            <span className={cn("flex-1 text-15", city ? "text-ink-primary" : "text-ink-tertiary")}>{city ? `${city.name}, ${city.state}` : "Select your city"}</span>
            <Icon name="chevron-right" size={18} className="text-ink-tertiary" strokeWidth={1.7} />
          </button>
        </div>

        <Check checked={age18} onChange={setAge18} label="I confirm I am 18 years or older" />
        <Check
          checked={dpdp}
          onChange={setDpdp}
          label={
            <>
              I agree to the processing of my data as per the <span className="text-accent">Privacy Policy</span>
            </>
          }
        />
      </div>

      <div className="flex-1" />
      <Button className="mb-6 mt-6" fullWidth loading={loading} disabled={!canSubmit} onClick={submit}>
        Start Exploring
      </Button>

      <CitySheet open={citySheet} onClose={() => setCitySheet(false)} selectedId={city?.id} onSelect={setCity} />
      <PhotoSheet
        open={photoSheet}
        onClose={() => setPhotoSheet(false)}
        hasPhoto={!!photoUrl}
        onTake={() => { fileRef.current?.setAttribute("capture", "environment"); fileRef.current?.click(); }}
        onChoose={() => { fileRef.current?.removeAttribute("capture"); fileRef.current?.click(); }}
        onRemove={async () => {
          const r = await removeProfilePhoto();
          if (r.ok) { setPhotoUrl(null); show("Photo removed"); } else show("Could not remove the photo");
        }}
      />
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-start gap-3 text-left">
      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-4 border transition-colors", checked ? "border-accent bg-accent text-ink-inverse" : "border-border bg-surface-1")}>
        {checked && <Icon name="check" size={14} strokeWidth={2.5} />}
      </span>
      <span className="text-13 text-ink-secondary">{label}</span>
    </button>
  );
}

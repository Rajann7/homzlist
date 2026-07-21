"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { CitySheet, type City } from "@/components/auth/CitySheet";
import { PhotoSheet } from "@/components/auth/PhotoSheet";
import { NumberChange } from "./NumberChange";
import { profileApi, type OwnProfile } from "@/lib/profile/client";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/**
 * S3 Edit Profile (P9). Avatar+change photo · name · bio + counter + number/URL
 * auto-flag warning · city + helper · phone + dual-OTP change · email + helper ·
 * builder/broker extras · verification row → S4. Save disabled until changed.
 */
const NUMBER_RE = /\d[\d\s-]{8,}\d/;
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|net|org|co)\b)/i;

export function EditProfile() {
  const router = useRouter();
  const { show } = useToast();
  const [init, setInit] = useState<OwnProfile | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState<{ id: string; name: string } | null>(null);
  const [officeAddress, setOfficeAddress] = useState("");
  const [establishedYear, setEstablishedYear] = useState("");
  const [projectsDone, setProjectsDone] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");

  const [citySheet, setCitySheet] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [numberChange, setNumberChange] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    profileApi.me().then((r) => {
      if (!r.ok) return;
      const p = r.data.profile;
      setInit(p);
      setName(p.name ?? "");
      setBio(p.bio ?? "");
      setEmail(p.email ?? "");
      setCity(p.cityId ? { id: p.cityId, name: p.cityName ?? "" } : null);
      setOfficeAddress(p.company.officeAddress ?? "");
      setEstablishedYear(p.company.establishedYear?.toString() ?? "");
      setProjectsDone(p.company.projectsDone?.toString() ?? "");
      setPhoneMasked(p.phoneMasked);
    });
  }, []);

  const dirty =
    !!init &&
    (name !== (init.name ?? "") ||
      bio !== (init.bio ?? "") ||
      email !== (init.email ?? "") ||
      city?.id !== (init.cityId ?? undefined) ||
      officeAddress !== (init.company.officeAddress ?? "") ||
      establishedYear !== (init.company.establishedYear?.toString() ?? "") ||
      projectsDone !== (init.company.projectsDone?.toString() ?? ""));

  const bioFlagged = bio.length > 0 && (NUMBER_RE.test(bio) || URL_RE.test(bio));

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    const patch: Record<string, unknown> = { name, bio, email };
    if (city) patch.cityId = city.id;
    if (init?.role === "builder" || init?.role === "broker") patch.officeAddress = officeAddress;
    if (init?.role === "builder") {
      if (establishedYear) patch.establishedYear = parseInt(establishedYear, 10);
      if (projectsDone) patch.projectsDone = parseInt(projectsDone, 10);
    }
    const r = await profileApi.update(patch);
    setSaving(false);
    if (r.ok) {
      show("Profile updated");
      setInit(r.data.profile);
    } else show("Couldn't save. Please try again.");
  }

  function tryBack() {
    if (dirty) setUnsaved(true);
    else router.back();
  }

  if (numberChange) return <NumberChange onCancel={() => setNumberChange(false)} onDone={(m) => { setPhoneMasked(m); setNumberChange(false); }} />;

  if (!init) return <div className="mx-auto w-full max-w-column p-4"><Skeleton className="h-40 w-full" /></div>;

  const isBuilder = init.role === "builder";
  const isBroker = init.role === "broker";

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page">
      <header className="chrome sticky top-0 z-header flex h-header items-center justify-between border-b border-border bg-surface-1 px-4">
        <button aria-label="Back" onClick={tryBack} className="grid h-11 w-11 -ml-2 place-items-center text-ink-primary">
          <Icon name="arrow-left" size={24} strokeWidth={1.7} />
        </button>
        <h1 className="text-17 font-semibold text-ink-primary">Edit profile</h1>
        <button onClick={save} disabled={!dirty || saving} className={cn("min-w-11 text-right text-15 font-semibold", dirty && !saving ? "text-accent" : "text-ink-disabled")}>
          {saving ? <Spinner size={18} className="text-accent" /> : "Save"}
        </button>
      </header>

      <div className="flex flex-col gap-5 p-4">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-2">
          <Avatar name={init.name ?? undefined} src={init.photoUrl ?? undefined} size={84} />
          <button onClick={() => setPhotoSheet(true)} className="text-13 font-semibold text-accent">
            Change photo
          </button>
        </div>

        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />

        {/* Bio + counter + auto-flag */}
        <div className="flex flex-col gap-2">
          <label className="chrome text-13 font-semibold text-ink-secondary">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 150))}
            rows={3}
            className="w-full rounded-8 border border-border bg-surface-2 p-3 text-15 text-ink-primary outline-none focus:border-accent"
          />
          <div className="flex justify-end text-11 text-ink-tertiary">{bio.length} / 150</div>
          {bioFlagged && (
            <p className="rounded-8 bg-warning-soft p-2 text-11 text-warning">
              Phone numbers and links aren&apos;t allowed in bios. Buyers can contact you through the app.
            </p>
          )}
        </div>

        {/* City */}
        <div className="flex flex-col gap-2">
          <label className="chrome text-13 font-semibold text-ink-secondary">City</label>
          <button onClick={() => setCitySheet(true)} className="flex h-11 items-center gap-2 rounded-8 border border-border bg-surface-2 px-3 text-left">
            <Icon name="pin" size={20} className="text-ink-tertiary" strokeWidth={1.7} />
            <span className={cn("flex-1 text-15", city ? "text-ink-primary" : "text-ink-tertiary")}>{city?.name || "Select your city"}</span>
            <Icon name="chevron-down" size={18} className="text-ink-tertiary" strokeWidth={1.7} />
          </button>
          <p className="text-11 text-ink-tertiary">Changing your city updates your feed and stories.</p>
        </div>

        {/* Phone (change) */}
        <div className="flex flex-col gap-2">
          <label className="chrome text-13 font-semibold text-ink-secondary">Phone number</label>
          <div className="flex h-11 items-center justify-between rounded-8 border border-border bg-surface-2 px-3">
            <span className="text-15 text-ink-primary">{phoneMasked}</span>
            <button onClick={() => setNumberChange(true)} className="text-13 font-semibold text-accent">
              Change
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} optional />
          <p className="text-11 text-ink-tertiary">For invoices and important updates only. You can&apos;t log in with email.</p>
        </div>

        {/* Role sections */}
        {(isBuilder || isBroker) && (
          <div className="flex flex-col gap-4">
            <p className="chrome text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{isBuilder ? "Company details" : "Business details"}</p>
            {isBuilder && (
              <div className="flex gap-3">
                <Input label="Established year" inputMode="numeric" value={establishedYear} onChange={(e) => setEstablishedYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                <Input label="Projects completed" inputMode="numeric" value={projectsDone} onChange={(e) => setProjectsDone(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="chrome text-13 font-semibold text-ink-secondary">Office address</label>
              <textarea value={officeAddress} onChange={(e) => setOfficeAddress(e.target.value.slice(0, 300))} rows={2} className="w-full rounded-8 border border-border bg-surface-2 p-3 text-15 text-ink-primary outline-none focus:border-accent" />
            </div>
          </div>
        )}

        {/* Verification row */}
        <button onClick={() => router.push("/profile/verification")} className="flex h-14 items-center gap-3 rounded-8 bg-surface-2 px-3 text-left">
          <Icon name="verified" size={22} className="text-accent" strokeWidth={1.5} />
          <span className="flex-1 text-15 font-semibold text-ink-primary">Verification</span>
          <span className="text-11 text-accent">{init.badges.rera ? "RERA ✓" : init.badges.id ? "ID ✓" : init.badges.phone ? "Phone ✓" : "Not verified"}</span>
          <Icon name="chevron-right" size={18} className="text-ink-tertiary" strokeWidth={1.7} />
        </button>
      </div>

      <CitySheet open={citySheet} onClose={() => setCitySheet(false)} selectedId={city?.id} onSelect={(c: City) => setCity({ id: c.id, name: `${c.name}, ${c.state}` })} />
      <PhotoSheet open={photoSheet} onClose={() => setPhotoSheet(false)} hasPhoto={!!init.photoUrl} onTake={() => show("Camera comes with the photo module")} onChoose={() => show("Gallery comes with the photo module")} onRemove={() => show("Photo removed")} />
      <ConfirmDialog open={unsaved} onClose={() => setUnsaved(false)} onConfirm={() => router.back()} title="Discard changes?" body="Your edits will be lost." confirmLabel="Discard" destructive />
    </div>
  );
}

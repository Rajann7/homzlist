"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

/**
 * The Grievance Officer card P12 puts above the body of that one document —
 * officer name, copyable email, address, the acknowledgement/resolution
 * timelines and the "Raise a grievance" button that opens the ticket form
 * pre-set to the grievance category.
 *
 * Every value comes from legal_settings, so appointing the real officer before
 * launch is an admin edit, not a code change.
 */
export function GrievanceCard({
  name,
  email,
  address,
  phone,
  hours,
  ackHours,
  resolutionDays,
}: {
  name: string;
  email: string;
  address: string;
  phone: string;
  hours: string;
  ackHours: number;
  resolutionDays: number;
}) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast.show("Copied to clipboard");
    } catch {
      toast.show("Couldn't copy the address", { variant: "error" });
    }
  };

  return (
    <div className="mx-4 my-3 flex flex-col gap-2 rounded-12 bg-surface-2 p-4">
      <Icon name="shield" size={32} className="text-accent" />
      <p className="text-15 font-semibold text-ink-primary">Grievance Officer</p>
      <p className="text-13 text-ink-primary">Name: {name || "[Officer Name]"}</p>
      <p className="flex items-center gap-1.5 text-13 text-ink-primary">
        Email:{" "}
        <a href={`mailto:${email}`} className="text-accent">
          {email}
        </a>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy email address"
          className="chrome grid h-7 w-7 place-items-center rounded-full text-ink-tertiary active:bg-surface-3"
        >
          <Icon name="copy" size={16} />
        </button>
      </p>
      <p className="text-13 text-ink-primary">Address: {address}</p>
      {phone && <p className="text-13 text-ink-primary">Phone: {phone}</p>}
      {hours && <p className="text-13 text-ink-primary">Hours: {hours}</p>}
      <p className="text-13 text-ink-secondary">
        We acknowledge complaints within {ackHours} hours and resolve them within {resolutionDays} days.
      </p>
      <Link
        href="/support/new?category=grievance"
        className="chrome mt-2 inline-flex h-11 items-center justify-center rounded-8 bg-accent px-4 text-15 font-semibold text-white active:bg-accent-pressed"
      >
        Raise a grievance
      </Link>
    </div>
  );
}

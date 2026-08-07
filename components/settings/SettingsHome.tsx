"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, type IconName, BottomSheet, Button, Skeleton, Avatar, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useTheme } from "@/components/theme/ThemeProvider";
import { settingsApi, type SettingsOverview } from "@/lib/settings/client";
import { authApi } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

/**
 * P10 S6 — Settings home (Doc4 §60). A navigation hub over the account: identity
 * card + grouped rows. Every value shown (verification badges, account-status
 * label, Saved / Drafts / Login-devices / Blocked counts, plan) is the server's
 * answer from GET /settings/overview — nothing is hardcoded. Rows route to the
 * screen that owns each thing; the only in-screen state is the Appearance choice
 * (a UI-only theme pref) and the Log-out confirm.
 */
export function SettingsHome({ base = "" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const [data, setData] = useState<SettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await settingsApi.overview();
    if (r.ok) { setData(r.data); setOffline(false); }
    else if (r.error.code === "OFFLINE") setOffline(true);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const go = (path: string) => router.push(`${base}${path}`);

  async function logout() {
    const r = await authApi.logout();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Cross-subdomain: the target is on a different host, which the App Router cannot navigate to.
    if (r.ok && r.data.switchedTo) { window.location.href = `${base}/profile`; return; }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Cross-subdomain: the target is on a different host, which the App Router cannot navigate to.
    window.location.href = `${base}/login`;
  }

  const header = <Header left={<BackButton fallback={`${base}/profile`} />} title="Settings" centerTitle />;

  if (loading) {
    return (
      <AppShell header={header}>
        <div className="p-4"><Skeleton className="h-[72px] w-full rounded-12" /></div>
        {[0, 1, 2].map((s) => (
          <div key={s}>
            <div className="px-4 pb-2 pt-5"><Skeleton className="h-3 w-24" /></div>
            {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3 px-4 py-3"><Skeleton className="h-6 w-6 rounded-6" /><Skeleton className="h-4 w-40" /></div>)}
          </div>
        ))}
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell header={header}>
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Icon name="wifi-off" size={48} className="text-ink-disabled" />
          <p className="text-13 text-ink-tertiary">{offline ? "You're offline. Reconnect to load your settings." : "Couldn't load your settings."}</p>
          <Button variant="outline" onClick={() => { setLoading(true); void load(); }}>Retry</Button>
        </div>
      </AppShell>
    );
  }

  const id = data.identity;
  const roleLabel = id.role ? id.role[0].toUpperCase() + id.role.slice(1) : "";
  // Each level stands on its own. RERA used to imply ID — so a broker/builder
  // with RERA approved and no ID document read "ID ✓ · RERA ✓" here while the
  // profile chips and the Verification screen both said ID was unearned.
  const verifBadge =
    [data.verification.id && "ID ✓", data.verification.rera && "RERA ✓"].filter(Boolean).join(" · ") || null;
  const themeLabel = theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light";

  return (
    <AppShell header={header}>
      {offline && (
        <div className="flex items-center justify-center gap-2 bg-ink-primary px-2 py-2 text-[12px] text-page">
          <Icon name="wifi-off" size={16} /> You&apos;re offline — showing last saved data
        </div>
      )}

      {/* Identity card → edit profile */}
      <div className="px-4 pb-1 pt-4">
        <button onClick={() => go("/profile/edit")} className="flex w-full items-center gap-3 rounded-12 bg-surface-2 p-3 text-left active:opacity-90">
          <Avatar name={id.name ?? undefined} src={id.photoUrl ?? undefined} size={48} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-15 font-semibold text-ink-primary">{id.name ?? id.username ?? "Your profile"}</span>
            <span className="block truncate text-11 text-ink-tertiary">{[id.phone, roleLabel].filter(Boolean).join(" · ")}</span>
          </span>
          <Icon name="chevron-right" size={18} className="text-ink-tertiary" />
        </button>
      </div>

      <Section title="Account">
        <Row icon="user" label="Edit profile" onClick={() => go("/profile/edit")} />
        <Row icon="phone" label="Phone number" value={id.phone} onClick={() => go("/profile/edit")} />
        <Row icon="mail" label="Email" value={id.email ?? "Not added"} onClick={() => go("/profile/edit")} />
        <Row icon="pin" label="City" value={id.cityName ?? "Not set"} onClick={() => go("/profile/edit")} />
        <Row icon="verified" label="Verification" trail={verifBadge ? <Badge tone="accent">{verifBadge}</Badge> : undefined} onClick={() => go("/profile/verification")} />
        <Row icon="shield" label="Account status" value={data.accountStatus.label} onClick={() => go("/settings/account-status")} />
      </Section>

      <Section title="Preferences">
        <Row icon="bell" label="Notifications" onClick={() => go("/settings/notifications")} />
        <Row icon="globe" label="Language" value={data.language} onClick={() => go("/settings/language")} />
        <Row icon="moon" label="Appearance" value={themeLabel} onClick={() => setAppearance(true)} />
        <Row icon="lock" label="Privacy" onClick={() => go("/settings/privacy")} />
      </Section>

      <Section title="Your content">
        <Row icon="bookmark" label="Saved" value={data.counts.saved ? String(data.counts.saved) : undefined} onClick={() => go("/saved")} />
        <Row icon="clock" label="Your activity" onClick={() => go("/activity")} />
        <Row icon="file" label="Drafts" trail={data.counts.drafts ? <Badge tone="neutral">{String(data.counts.drafts)}</Badge> : undefined} onClick={() => go("/create/drafts")} />
        <Row icon="archive" label="Archived" onClick={() => go("/archived")} />
        <Row icon="trash" label="Recently deleted" onClick={() => go("/listings/trash")} />
        <Row icon="list" label="My listings" onClick={() => go("/listings")} />
      </Section>

      <Section title="Plans & billing">
        <Row icon="card" label="My plan" value={data.plan ?? "Free"} onClick={() => go("/plans/my")} />
        <Row icon="receipt" label="Payment history" onClick={() => go("/payments")} />
        <Row icon="rocket" label="Boosts" onClick={() => go("/boost")} />
      </Section>

      <Section title="Security">
        <Row icon="device" label="Login activity" value={data.counts.devices ? `${data.counts.devices} device${data.counts.devices === 1 ? "" : "s"}` : undefined} onClick={() => go("/settings/login-activity")} />
        <Row icon="shield-off" label="Blocked users" value={data.counts.blocked ? String(data.counts.blocked) : undefined} onClick={() => go("/messages/blocked")} />
      </Section>

      <Section title="Support">
        <Row icon="help-circle" label="Help centre" onClick={() => go("/help")} />
        <Row icon="headset" label="Contact support" onClick={() => go("/help/contact")} />
        <Row icon="file" label="My tickets" onClick={() => go("/help/tickets")} />
        <Row icon="flag" label="Report a problem" onClick={() => go("/help/contact?topic=report")} />
      </Section>

      <Section title="About">
        <Row icon="file" label="Terms of Service" onClick={() => go("/legal/terms")} />
        <Row icon="file" label="Privacy Policy" onClick={() => go("/legal/privacy")} />
        <Row icon="file" label="Refund Policy" onClick={() => go("/legal/refund")} />
        <Row icon="user" label="Grievance Officer" onClick={() => go("/legal/grievance")} />
        <Row icon="help-circle" label="About HomzList" onClick={() => go("/legal/about")} />
        <Row icon="book" label="Blog" onClick={() => go("/blog")} />
        <Row icon="file" label="All legal pages" onClick={() => go("/legal")} />
        <Row icon="download" label="Download your data" onClick={() => go("/settings/data")} />
        <Row icon="star" label="Rate us on Google" trail={<Icon name="external" size={18} className="text-ink-tertiary" />} onClick={() => toast.show("Opening Google Play…")} />
      </Section>

      <Section title="Danger zone">
        <Row icon="log-out" label="Log out" destructive onClick={() => setLogoutOpen(true)} />
        <Row icon="shield-off" label="Deactivate account" destructive onClick={() => go("/settings/account")} />
        <Row icon="trash" label="Delete account" destructive onClick={() => go("/settings/account")} />
      </Section>

      <div className="px-4 pb-[calc(28px+env(safe-area-inset-bottom))] pt-7 text-center">
        <div className="text-17 font-bold text-ink-primary">Homz<span className="text-accent">List</span></div>
        {/* Real build identity (Doc3 §98) — package version + the commit this
            bundle was built from, injected at build time. */}
        <div className="mt-1.5 text-11 text-ink-tertiary">
          Version {process.env.NEXT_PUBLIC_APP_VERSION} (build {process.env.NEXT_PUBLIC_APP_BUILD})
        </div>
        <div className="mt-0.5 text-11 text-ink-tertiary">Made in Rajkot</div>
      </div>

      {/* Appearance — the only in-screen preference (UI-only theme, localStorage). */}
      <BottomSheet open={appearance} onClose={() => setAppearance(false)} title="Appearance">
        <div className="flex flex-col pb-2">
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} onClick={() => { setTheme(t); setAppearance(false); }} className="flex h-12 items-center gap-3 text-left text-15 text-ink-primary active:bg-surface-2">
              <Icon name={t === "dark" ? "moon" : t === "light" ? "sun" : "device"} size={20} strokeWidth={1.7} />
              <span className="flex-1 capitalize">{t}</span>
              {theme === t && <Icon name="check" size={20} className="text-accent" strokeWidth={2} />}
            </button>
          ))}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => void logout()}
        title="Log out?"
        body="You'll need an OTP to sign back in on this device."
        confirmLabel="Log out"
        destructive
      />
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      {/* Plain text, not dangerouslySetInnerHTML. It only ever received string
          literals so nothing was exploitable — but it was XSS surface sitting on
          a screen whose section titles could easily become admin-editable, and
          the one thing it existed for was an HTML-escaped ampersand that JSX
          renders correctly on its own. */}
      <div className="chrome px-4 pb-2 pt-5 text-13 font-semibold uppercase tracking-[0.4px] text-ink-tertiary">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  icon, label, value, trail, destructive, onClick,
}: {
  icon: IconName;
  label: string;
  value?: string;
  trail?: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
      <Icon name={icon} size={22} strokeWidth={1.7} className={destructive ? "text-error" : "text-ink-secondary"} />
      <span className={cn("flex-1 truncate text-15", destructive ? "text-error" : "text-ink-primary")}>{label}</span>
      {value && <span className="max-w-[45%] truncate text-13 text-ink-tertiary">{value}</span>}
      {trail}
      {!destructive && <Icon name="chevron-right" size={18} className="text-ink-tertiary" />}
    </button>
  );
}

function Badge({ tone, children }: { tone: "accent" | "neutral"; children: React.ReactNode }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold",
      tone === "accent" ? "bg-accent-soft text-accent" : "bg-surface-3 text-ink-secondary",
    )}>
      {children}
    </span>
  );
}

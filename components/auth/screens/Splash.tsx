"use client";

import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/nav/Header";
import { MaintenanceArt } from "@/components/auth/illustrations";

/**
 * S1 Splash (P1). App icon 96 accent rounded-square + white H · wordmark 24
 * (8px gap) · 3×6px accent loader dots at bottom-48. Variants: update, maintenance.
 */
export function Splash({ variant = "default", onRefresh }: { variant?: "default" | "update" | "maintenance"; onRefresh?: () => void }) {
  if (variant === "update") {
    return (
      <Center>
        <AppIcon />
        <Wordmark className="mt-2 text-24" />
        <p className="mt-6 text-15 text-ink-secondary">A new version is available</p>
        <Button className="mt-4 w-40" onClick={onRefresh}>
          Refresh
        </Button>
      </Center>
    );
  }
  if (variant === "maintenance") {
    return (
      <Center>
        <MaintenanceArt size={96} />
        <p className="mt-6 text-17 font-semibold text-ink-primary">We&apos;ll be back shortly</p>
        <p className="mt-1 text-13 text-ink-tertiary">Estimated: 30 minutes</p>
      </Center>
    );
  }
  return (
    <Center>
      <AppIcon />
      <Wordmark className="mt-2 text-24" />
      <div className="absolute bottom-12 flex gap-2" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-[6px] w-[6px] rounded-full bg-accent" style={{ animation: `pulse-dot 1.2s ${i * 0.15}s infinite ease-in-out` }} />
        ))}
      </div>
      <style jsx>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.3; transform: scale(0.9); }
          40% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-page px-6 text-center">{children}</div>;
}

function AppIcon() {
  return (
    <span className="grid h-24 w-24 place-items-center rounded-[22px] bg-accent">
      <svg width="56" height="56" viewBox="0 0 512 512" aria-hidden="true">
        <path fill="#fff" d="M256 104 128 214v22h40v-14l88-76 88 76v14h40v-22z" />
        <rect x="168" y="250" width="40" height="158" rx="8" fill="#fff" />
        <rect x="304" y="250" width="40" height="158" rx="8" fill="#fff" />
        <rect x="188" y="308" width="136" height="40" rx="8" fill="#fff" />
      </svg>
    </span>
  );
}

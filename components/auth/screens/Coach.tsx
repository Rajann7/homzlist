"use client";

import { useState } from "react";
import { Wordmark } from "@/components/nav/Header";
import { Icon } from "@/components/ui/Icon";

/**
 * S8 Coach Marks (P1). Dimmed simplified-feed + 3-step highlight tour (city →
 * requirements → messages), dark #262626 tooltip + sequence dots. → into the app.
 */
const STEPS = [
  { text: "Change your city anytime — your feed and stories update instantly" },
  { text: "Post what you need — matching properties find you" },
  { text: "All inquiries and leads live here" },
];

export function Coach({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-page">
      <div className="pointer-events-none select-none">
        <div className="flex h-header items-center justify-between border-b border-border px-4">
          <Wordmark />
          <div className="flex items-center gap-3 text-ink-primary">
            <Icon name="bell" size={24} strokeWidth={1.7} />
            <Icon name="message" size={24} strokeWidth={1.7} />
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2">
          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-13">
            <Icon name="pin" size={16} strokeWidth={1.7} /> Rajkot
          </span>
        </div>
        <div className="flex gap-3 overflow-hidden px-4 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="h-16 w-16 shrink-0 rounded-full bg-surface-2" />
          ))}
        </div>
        <div className="mx-4 mt-2 aspect-[4/5] rounded-12 bg-surface-2" />
      </div>

      <div className="absolute inset-0 bg-black/60" />

      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2">
        <div className="rounded-12 bg-[#262626] p-4 text-white shadow-l3">
          <p className="text-13">{s.text}</p>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-accent" : "bg-white/30"}`} />
              ))}
            </div>
            <button onClick={() => (last ? onDone() : setStep((n) => n + 1))} className="text-13 font-semibold text-[color:var(--accent)]">
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

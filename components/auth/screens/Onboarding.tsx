"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { HouseSearchArt, ChatShieldArt, MatchingArt } from "@/components/auth/illustrations";
import { cn } from "@/lib/utils";

/**
 * S2 Onboarding (P1, pixel-exact). 3 slides (art 240 + title 20/700 + sub 15
 * #555). Skip 15/600 #8E8E8E top-right. Dots: active 8px accent / inactive 6px
 * #EFEFEF. Button h44 accent 15/600 (Next / Get Started).
 */
const SLIDES = [
  { art: HouseSearchArt, title: "Find properties without spam calls", sub: "Browse verified listings across India — from owners, brokers and builders." },
  { art: ChatShieldArt, title: "Chat safely. Share your number when YOU want", sub: "Your phone number stays private until you allow it." },
  { art: MatchingArt, title: "Post a requirement, get matched", sub: "Tell us what you need — matching properties come to you." },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const Slide = SLIDES[i].art;
  const last = i === SLIDES.length - 1;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page px-4">
      <div className="flex h-header items-center justify-end">
        <button onClick={onDone} className="chrome grid h-11 min-w-11 place-items-center px-2 text-15 font-semibold text-ink-tertiary">
          Skip
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Slide size={240} />
        <h1 className="mt-8 max-w-xs text-20 font-bold text-ink-primary">{SLIDES[i].title}</h1>
        <p className="mt-3 max-w-xs text-15 text-ink-secondary">{SLIDES[i].sub}</p>
      </div>

      <div className="mb-2 flex justify-center gap-2">
        {SLIDES.map((_, idx) => (
          <span key={idx} className={cn("h-[6px] rounded-full transition-[width] duration-150 ease-out-quart", idx === i ? "w-2 bg-accent" : "w-[6px] bg-surface-3")} />
        ))}
      </div>

      <Button className="mb-6 mt-2" fullWidth onClick={() => (last ? onDone() : setI((n) => n + 1))}>
        {last ? "Get Started" : "Next"}
      </Button>
    </div>
  );
}

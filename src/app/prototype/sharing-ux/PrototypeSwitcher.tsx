"use client";

import { useEffect } from "react";
import { Icon } from "@/components/Icon";

// PROTOTYPE-only control (issue #59) — cycles the three sharing-UX
// variants. Gated on NODE_ENV so a stray merge to main can't ship it.
const VARIANTS = [
  { key: "A", name: "Inline in the switcher" },
  { key: "B", name: "Dedicated collaborators page" },
  { key: "C", name: "Slide-over drawer" },
] as const;

export type VariantKey = (typeof VARIANTS)[number]["key"];

export function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: VariantKey;
  onChange: (key: VariantKey) => void;
}) {
  const index = VARIANTS.findIndex((v) => v.key === current);
  const active = VARIANTS[index] ?? VARIANTS[0];

  function step(delta: 1 | -1) {
    const next = (index + delta + VARIANTS.length) % VARIANTS.length;
    onChange(VARIANTS[next].key);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border border-neutral-800 bg-neutral-800 px-2 py-1.5 text-neutral-0 shadow-lg">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Previous variant"
        className="rounded-full p-1 hover:bg-neutral-0/10"
      >
        <Icon name="chevron_left" label="Previous variant" />
      </button>
      <span className="px-2 text-small font-medium">
        {active.key} — {active.name}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Next variant"
        className="rounded-full p-1 hover:bg-neutral-0/10"
      >
        <Icon name="chevron_right" label="Next variant" />
      </button>
    </div>
  );
}

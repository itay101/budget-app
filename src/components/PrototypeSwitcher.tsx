"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";

export type PrototypeToggle = {
  param: string;
  label: string;
  /** First value is the default (left out of the URL). */
  values: string[];
};

/**
 * PROTOTYPE tooling: the floating bar for flipping between `?variant=`
 * variants of a throwaway UI prototype (see `.claude/skills/prototype`).
 * ←/→ buttons and arrow keys cycle variants; `toggles` add extra URL-param
 * switches (theme, direction, data source). The caller only renders it
 * outside production.
 */
export function PrototypeSwitcher({
  variants,
  current,
  toggles = [],
}: {
  variants: { key: string; name: string }[];
  current: string;
  toggles?: PrototypeToggle[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(param: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(param);
    else params.set(param, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const index = Math.max(0, variants.findIndex((v) => v.key === current));
  function cycle(step: number) {
    const next = variants[(index + step + variants.length) % variants.length];
    setParam("variant", next.key);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      dir="ltr"
      className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full bg-neutral-800 px-2 py-1 text-small text-white shadow-lg ring-2 ring-white/40"
    >
      <button type="button" onClick={() => cycle(-1)} className="rounded-full p-1 hover:bg-white/20" title="Previous variant">
        <Icon name="chevron_left" label="Previous variant" />
      </button>
      <span className="whitespace-nowrap px-1 font-medium">
        {variants[index].key}
        <span className="hidden sm:inline"> ({variants[index].name})</span>
      </span>
      <button type="button" onClick={() => cycle(1)} className="rounded-full p-1 hover:bg-white/20" title="Next variant">
        <Icon name="chevron_right" label="Next variant" />
      </button>
      {toggles.map((t) => {
        const value = searchParams.get(t.param) ?? t.values[0];
        const next = t.values[(t.values.indexOf(value) + 1) % t.values.length];
        return (
          <button
            key={t.param}
            type="button"
            onClick={() => setParam(t.param, next === t.values[0] ? null : next)}
            className="whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 hover:bg-white/20"
            title={`Switch ${t.label}`}
          >
            <span className="hidden sm:inline">{t.label}: </span>
            {value}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setParam("variant", null)}
        className="rounded-full p-1 hover:bg-white/20"
        title="Exit prototype"
      >
        <Icon name="close" label="Exit prototype" />
      </button>
    </div>
  );
}

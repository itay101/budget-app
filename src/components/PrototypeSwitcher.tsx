"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTypingTarget(el: HTMLElement | null): boolean {
  return !!el && (TYPING_TAGS.has(el.tagName) || el.isContentEditable);
}

/**
 * PROTOTYPE ONLY: a floating bar for flipping between UI variants of a page
 * via a URL search param (default `?variant=`). Shared by every throwaway UI
 * prototype; the host page decides whether to render it at all (never in
 * production).
 *
 * `toggles` are extra search params to cycle through (e.g. the state a
 * variant is showing), rendered as small chips next to the variant label.
 */
export function PrototypeSwitcher({
  variants,
  current,
  param = "variant",
  toggles = [],
}: {
  variants: { key: string; name: string }[];
  current: string;
  param?: string;
  toggles?: {
    param: string;
    label: string;
    values: string[];
    current: string;
  }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const step = useCallback(
    (delta: number) => {
      const next =
        variants[(index + delta + variants.length) % variants.length];
      setParam(param, next.key);
    },
    [index, param, setParam, variants],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  const active = variants[index];

  return (
    <div className="fixed bottom-2 left-1/2 z-[100] flex w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl sm:bottom-4 sm:w-auto sm:max-w-[calc(100vw-1rem)] bg-black px-3 py-2 text-small text-white shadow-2xl ring-2 ring-fuchsia-400">
      <span className="font-bold uppercase tracking-wide text-fuchsia-300">
        Prototype
      </span>
      <button
        type="button"
        onClick={() => step(-1)}
        className="rounded-full px-2 hover:bg-white/20"
        aria-label="Previous variant"
      >
        ←
      </button>
      <span className="text-center font-medium sm:min-w-[10rem]">
        {active.key} ({active.name})
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        className="rounded-full px-2 hover:bg-white/20"
        aria-label="Next variant"
      >
        →
      </button>
      {toggles.map((t) => {
        const i = Math.max(0, t.values.indexOf(t.current));
        return (
          <button
            key={t.param}
            type="button"
            onClick={() =>
              setParam(t.param, t.values[(i + 1) % t.values.length])
            }
            className="rounded-full bg-white/10 px-2 py-0.5 hover:bg-white/25"
            title={`Cycle ${t.label}`}
          >
            {t.label}: <span className="font-semibold">{t.values[i]}</span>
          </button>
        );
      })}
    </div>
  );
}

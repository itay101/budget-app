"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";

/**
 * PROTOTYPE tooling: the floating bottom bar for flipping between UI
 * prototype variants via `?variant=`. ←/→ keys cycle too (ignored while
 * typing). An optional on/off toggle sets one more search param (e.g.
 * `?theme=dark`). Callers only render it outside production.
 */
export function PrototypeSwitcher({
  variants,
  current,
  toggle,
}: {
  variants: { key: string; name?: string }[];
  current: string;
  toggle?: { param: string; on: string; label: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const setParam = useCallback(
    (param: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null) params.delete(param);
      else params.set(param, value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const go = useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length];
      setParam("variant", next.key);
    },
    [variants, index, setParam],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const v = variants[index];
  const toggleOn = toggle && searchParams.get(toggle.param) === toggle.on;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-800 px-2 py-1 text-small text-neutral-0 shadow-lg ring-2 ring-discovery">
      <button
        type="button"
        onClick={() => go(-1)}
        className="rounded-full p-1 hover:bg-neutral-600"
      >
        <Icon name="chevron_left" label="Previous variant" />
      </button>
      <span className="whitespace-nowrap px-1 font-medium">
        {v.key}
        {v.name && ` (${v.name})`}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="rounded-full p-1 hover:bg-neutral-600"
      >
        <Icon name="chevron_right" label="Next variant" />
      </button>
      {toggle && (
        <button
          type="button"
          onClick={() => setParam(toggle.param, toggleOn ? null : toggle.on)}
          className="ms-1 whitespace-nowrap rounded-full border border-neutral-600 px-2 py-0.5 hover:bg-neutral-600"
        >
          {toggle.label}
        </button>
      )}
    </div>
  );
}

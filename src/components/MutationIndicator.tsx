"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  installFetchTracker,
  subscribe,
} from "@/lib/mutationTracker";

/**
 * A slim progress bar fixed to the top of the viewport, shown whenever a
 * POST/PUT/PATCH request (a Server Action call, from any form or client
 * component) is in flight anywhere in the app. See lib/mutationTracker.
 */
export function MutationIndicator() {
  useEffect(() => {
    installFetchTracker();
  }, []);

  const pendingCount = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const active = pendingCount > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={active ? "Saving…" : undefined}
      className={
        "pointer-events-none fixed left-0 right-0 top-0 z-50 h-0.5 overflow-hidden bg-transparent transition-opacity duration-200 " +
        (active ? "opacity-100" : "opacity-0")
      }
    >
      <div className="h-full w-1/3 animate-mutation-bar bg-brand-700" />
    </div>
  );
}

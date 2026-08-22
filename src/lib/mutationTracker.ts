"use client";

/**
 * Tracks in-flight POST/PUT/PATCH requests globally by wrapping
 * `window.fetch` once. Every Server Action call in this app — whether from
 * a plain `<form action={...}>` or called directly from a client component
 * via `startTransition` — goes through `fetch` under the hood (Next.js
 * implements Server Actions as a POST to the current route), so patching
 * fetch here is a single point that catches all of them without touching
 * every call site. Ordinary navigations/RSC fetches are GET and are left
 * alone.
 *
 * Exposed as a tiny external store (module-level count + listeners) so
 * `MutationIndicator` can subscribe to it with `useSyncExternalStore`.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH"]);

let pendingCount = 0;
let patched = false;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return pendingCount;
}

export function getServerSnapshot() {
  return 0;
}

export function installFetchTracker() {
  if (patched || typeof window === "undefined") return;
  patched = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    if (!MUTATING_METHODS.has(method)) {
      return originalFetch(...args);
    }

    pendingCount++;
    emitChange();
    try {
      return await originalFetch(...args);
    } finally {
      pendingCount--;
      emitChange();
    }
  };
}

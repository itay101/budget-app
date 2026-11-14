"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * A short-lived message at the bottom of the screen with one optional
 * action, e.g. Auto-Assign's "Assigned $X to N categories · Undo" (#147).
 * It hides itself after `duration` ms unless dismissed or acted on first.
 */
export function Toast({
  message,
  actionLabel,
  onAction,
  onClose,
  duration = 10_000,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return createPortal(
    <div
      role="status"
      className="fixed inset-x-0 bottom-200 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-200 rounded-lg bg-neutral-800 px-200 py-2 text-body text-neutral-0 shadow-lg"
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-sm px-2 py-1 font-semibold text-neutral-0 underline hover:bg-neutral-0/10"
        >
          {actionLabel}
        </button>
      )}
    </div>,
    document.body,
  );
}

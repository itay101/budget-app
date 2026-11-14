"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * A message at the bottom of the screen with an optional action, e.g.
 * Auto-Assign's "Assigned $X to N categories · Undo" (#147).
 *
 * A toast with an action stays until it's used or dismissed, so Undo lasts
 * for the page session (#219). One without hides itself after
 * `duration` ms.
 */
export function Toast({
  message,
  actionLabel,
  onAction,
  onClose,
  duration = 6_000,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
  duration?: number;
}) {
  const hasAction = Boolean(actionLabel && onAction);
  // The latest onClose, so a parent's fresh inline function each render
  // doesn't restart the timer.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (hasAction) return;
    const timer = setTimeout(() => onCloseRef.current(), duration);
    return () => clearTimeout(timer);
  }, [hasAction, duration, message]);

  return createPortal(
    <div
      role="status"
      className="fixed inset-x-0 bottom-200 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg bg-neutral-800 px-200 py-2 text-body text-neutral-0 shadow-lg"
    >
      <span>{message}</span>
      {hasAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-sm px-2 py-1 font-semibold text-neutral-0 underline hover:bg-neutral-0/10"
        >
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="rounded-sm px-1 text-neutral-0/80 hover:bg-neutral-0/10 hover:text-neutral-0"
      >
        ×
      </button>
    </div>,
    document.body,
  );
}

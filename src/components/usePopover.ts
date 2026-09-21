"use client";

import { useEffect, useRef, useState } from "react";

export type PopoverAlign = "left" | "right";

export interface PopoverPosition {
  top: number;
  left: number;
}

export interface UsePopoverOptions {
  /**
   * Popover panel width in px - used to align it under the trigger and
   * keep it clear of the viewport edges. Must match the panel's own width
   * class (e.g. `w-64` -> 256).
   */
  width: number;
  /**
   * Which edge of the trigger the panel aligns to: "left" (default) lines
   * the panel's left edge up with the trigger's left edge; "right" lines
   * the panel's right edge up with the trigger's right edge (for
   * right-anchored triggers, e.g. a table column header or a row's kebab
   * menu).
   */
  align?: PopoverAlign;
  /**
   * Called - in addition to closing the popover - when it's dismissed via
   * an outside click or Escape, for callers that need to reset extra
   * state alongside `open` (e.g. BudgetSwitcherList's in-progress
   * add/rename/delete sub-forms). May be a fresh function each render;
   * only its latest value is ever used.
   */
  onDismiss?: () => void;
}

/**
 * Shared trigger/panel positioning for the app's popovers and dropdown
 * menus (the "+ Add" popovers, the budget switcher, the date-range
 * filter, the move-money popover, and TransactionsTable's row "more
 * actions" menu): owns the open state, the trigger/panel ref pair, the
 * `getBoundingClientRect` position math (kept in sync on scroll/resize),
 * and the outside-click/Escape-to-dismiss listeners.
 *
 * Callers render the trigger themselves (attaching `triggerRef` and
 * toggling `open`/`setOpen`) and portal the panel to `document.body`
 * (attaching `panelRef` and positioning it via the returned `position`):
 *
 *   const { open, setOpen, position, triggerRef, panelRef } = usePopover({ width: 256 });
 *   <button ref={triggerRef} onClick={() => setOpen((o) => !o)}>...</button>
 *   {open && position && createPortal(
 *     <div ref={panelRef} style={{ position: "fixed", top: position.top, left: position.left }}>
 *       ...
 *     </div>,
 *     document.body,
 *   )}
 */
export function usePopover({ width, align = "left", onDismiss }: UsePopoverOptions) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Keep the dismiss callback fresh without making it an effect dependency
  // - callers often pass a fresh inline function each render.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rawLeft = align === "right" ? rect.right - width : rect.left;
      setPosition({
        top: rect.bottom + 4,
        left: Math.min(Math.max(8, rawLeft), window.innerWidth - width - 8),
      });
    }
    updatePosition();

    function handlePointerDown(e: MouseEvent) {
      if (
        panelRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
      onDismissRef.current?.();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        onDismissRef.current?.();
      }
    }

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, align, width]);

  return { open, setOpen, position, triggerRef, panelRef };
}

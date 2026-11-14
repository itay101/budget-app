"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { AutoAssignMenu, AutoAssignToasts, type AutoAssignDone } from "@/components/AutoAssignMenu";
import { useAutoAssign } from "@/components/ReadyToAssignContext";
import { usePopover } from "@/components/usePopover";

/**
 * A category group header's Auto-Assign menu (#147, #219): the same options
 * as the Ready to Assign drawer, scoped to that group's categories, hidden
 * ones included. Renders nothing outside a ReadyToAssignProvider.
 */
export function GroupAutoAssignPopover({
  groupId,
  groupName,
  month,
  currency,
}: {
  groupId: string;
  groupName: string;
  /** The viewed Budget Month, `YYYY-MM`. */
  month: string;
  currency: string;
}) {
  const autoAssign = useAutoAssign();
  const [lastRun, setLastRun] = useState<AutoAssignDone | null>(null);
  // 288 matches the panel's w-72.
  const { open, setOpen, position, triggerRef, panelRef } = usePopover({ width: 288 });

  if (!autoAssign) return null;
  const categories = autoAssign.categories.filter((c) => c.groupId === groupId);
  if (categories.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Auto-Assign ${groupName}`}
        className="rounded-sm p-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
      >
        <Icon name="auto_fix_high" label={`Auto-Assign ${groupName}`} />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`Auto-Assign ${groupName}`}
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="z-50 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-neutral-200 bg-neutral-0 p-3 shadow-lg"
          >
            <AutoAssignMenu
              categories={categories}
              limit={autoAssign.limit}
              month={month}
              currency={currency}
              autoAssign={autoAssign.run}
              onDone={(done) => {
                setOpen(false);
                setLastRun(done);
              }}
            />
          </div>,
          document.body,
        )}
      <AutoAssignToasts
        run={lastRun}
        currency={currency}
        undoAutoAssign={autoAssign.undo}
        onRunClosed={() => setLastRun(null)}
      />
    </>
  );
}

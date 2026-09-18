"use client";

import { useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { usePopover } from "@/components/usePopover";

/**
 * The "+ Add" button on the budget table's "Category" column header,
 * opening a small popover (same pattern as AddAccountPopover/
 * MoveMoneyPopover) with the create-category-group form, instead of the
 * standalone "Add category group" box that used to sit below the table.
 */
export function AddCategoryGroupPopover({
  createCategoryGroup,
}: {
  createCategoryGroup: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const { open, setOpen, position, triggerRef, panelRef } = usePopover({
    width: 256, // matches the popover's w-64
  });
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await createCategoryGroup(formData);
      formRef.current?.reset();
      setOpen(false);
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-small font-medium normal-case tracking-normal text-brand-700 hover:bg-brand-700/10"
      >
        <Icon name="add" /> Add
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-neutral-200 bg-neutral-0 p-3 text-left shadow-lg"
          >
            <p className="mb-2 text-small font-medium text-neutral-800">
              Add category group
            </p>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-2">
              <div>
                <label
                  className="block text-small text-neutral-600"
                  htmlFor="new-group-name"
                >
                  Name
                </label>
                <input
                  id="new-group-name"
                  name="name"
                  required
                  autoFocus
                  className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                >
                  {pending ? "Adding…" : "Add category group"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}

"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { usePopover } from "@/components/usePopover";
import { useServerAction } from "@/components/useServerAction";

/**
 * The shared shell behind the app's "+ Add …" popovers (AddAccountPopover,
 * AddCategoryGroupPopover, AddCategoryPopover): an "+ <triggerLabel>"
 * button that opens a w-64 panel holding a titled create form with
 * Cancel / submit buttons. On submit it runs `onSubmit` via
 * useServerAction (so the submit button shows "Adding…" for as long as
 * the action is actually in flight), then resets the form and closes the
 * popover; if the action throws, the popover stays open with the error.
 *
 * Callers supply only what differs - the trigger's label and classes, the
 * panel title, the submit label, the action, and the form's fields as
 * `children`.
 */
export function AddFormPopover({
  triggerLabel,
  triggerClassName,
  title,
  submitLabel,
  onSubmit,
  children,
}: {
  triggerLabel: string;
  triggerClassName: string;
  title: string;
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const { run, pending, error } = useServerAction(onSubmit);
  const { open, setOpen, position, triggerRef, panelRef } = usePopover({
    width: 256, // matches the popover's w-64
  });
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields: Record<string, string> = {};
    for (const [key, value] of new FormData(e.currentTarget)) {
      if (typeof value === "string") fields[key] = value;
    }
    run(fields).then(
      () => {
        formRef.current?.reset();
        setOpen(false);
      },
      () => {
        // error is surfaced via `error`
      },
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        <Icon name="add" /> {triggerLabel}
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
              {title}
            </p>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-2">
              {children}
              {error && <p className="text-small text-danger">{error}</p>}
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
                  {pending ? "Adding…" : submitLabel}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}

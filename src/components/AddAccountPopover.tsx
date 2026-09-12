"use client";

import { useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { ACCOUNT_TYPE_OPTIONS } from "@/lib/accountTypes";
import { MoneyInput } from "@/components/MoneyInput";
import { Icon } from "@/components/Icon";
import { usePopover } from "@/components/usePopover";

/**
 * The sidebar's "+ Add account" button, opening a small popover (same
 * pattern as MoveMoneyPopover) with the create-account form, instead of
 * navigating to the Accounts page.
 */
export function AddAccountPopover({
  createAccount,
  currency,
}: {
  createAccount: (formData: FormData) => Promise<void>;
  currency: string;
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
      await createAccount(formData);
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
        className="mt-1 flex w-full items-center gap-0.5 rounded px-3 py-1.5 text-left text-small font-medium text-brand-700 hover:bg-brand-700/10"
      >
        <Icon name="add" /> Add account
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
              Add account
            </p>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-2">
              <div>
                <label
                  className="block text-small text-neutral-600"
                  htmlFor="new-account-name"
                >
                  Name
                </label>
                <input
                  id="new-account-name"
                  name="name"
                  required
                  autoFocus
                  className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                />
              </div>
              <div>
                <label
                  className="block text-small text-neutral-600"
                  htmlFor="new-account-type"
                >
                  Type
                </label>
                <select
                  id="new-account-type"
                  name="type"
                  defaultValue="CHECKING"
                  className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                >
                  {ACCOUNT_TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="block text-small text-neutral-600"
                  htmlFor="new-account-balance"
                >
                  Starting balance
                </label>
                <MoneyInput
                  id="new-account-balance"
                  name="balance"
                  currency={currency}
                  defaultValue={0}
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
                  {pending ? "Adding…" : "Add account"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}

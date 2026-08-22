"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ACCOUNT_TYPE_OPTIONS } from "@/lib/accountTypes";
import { MoneyInput } from "@/components/MoneyInput";

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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 256; // matches the popover's w-64
      setPosition({
        top: rect.bottom + 4,
        left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      });
    }
    updatePosition();

    function handlePointerDown(e: MouseEvent) {
      if (
        popoverRef.current?.contains(e.target as Node) ||
        buttonRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
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
  }, [open]);

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
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-1 block w-full rounded px-3 py-1.5 text-left text-small font-medium text-brand-700 hover:bg-brand-700/10"
      >
        + Add account
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="z-50 w-64 rounded-lg border border-neutral-200 bg-neutral-0 p-3 text-left shadow-lg"
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

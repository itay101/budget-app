"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

type BudgetOption = { id: string; name: string; currency: string };
type CurrencyOption = { code: string; name: string };

/**
 * Sidebar control for which budget (= which currency) the app is
 * currently showing — click to switch to another existing budget, or open
 * a new one. Same popover pattern as AddAccountPopover/MoveMoneyPopover.
 *
 * The "new budget" currency <select> only ever lists currencies no budget
 * has claimed yet (`availableCurrencies`, computed server-side from the
 * full budget list), so a duplicate currency can't even be submitted from
 * this form — createBudget's own check is what actually enforces it.
 */
export function BudgetSwitcherPopover({
  currentBudget,
  budgets,
  availableCurrencies,
  switchBudget,
  createBudget,
}: {
  currentBudget: BudgetOption;
  budgets: BudgetOption[];
  availableCurrencies: CurrencyOption[];
  switchBudget: (formData: FormData) => Promise<void>;
  createBudget: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
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
      setAdding(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setAdding(false);
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
  }, [open]);

  function handleSwitch(budgetId: string) {
    if (budgetId === currentBudget.id) {
      setOpen(false);
      return;
    }
    const formData = new FormData();
    formData.set("budgetId", budgetId);
    startTransition(async () => {
      await switchBudget(formData);
      setOpen(false);
    });
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await createBudget(formData);
      formRef.current?.reset();
      setAdding(false);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-left text-small font-medium hover:bg-neutral-100"
      >
        <span className="truncate text-neutral-800">{currentBudget.name}</span>
        <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
          {currentBudget.currency}
        </span>
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
              Budgets
            </p>
            <ul className="mb-2 space-y-0.5">
              {budgets.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleSwitch(b.id)}
                    className={
                      "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-small " +
                      (b.id === currentBudget.id
                        ? "bg-brand-700/10 font-medium text-brand-700"
                        : "text-neutral-800 hover:bg-neutral-100")
                    }
                  >
                    <span className="truncate">{b.name}</span>
                    <span className="shrink-0 text-neutral-600">
                      {b.currency}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {!adding && availableCurrencies.length > 0 && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="block w-full rounded px-2 py-1 text-left text-small font-medium text-brand-700 hover:bg-brand-700/10"
              >
                + New budget
              </button>
            )}

            {!adding && availableCurrencies.length === 0 && (
              <p className="px-2 text-small text-neutral-600">
                Every supported currency already has a budget.
              </p>
            )}

            {adding && (
              <form
                ref={formRef}
                onSubmit={handleCreate}
                className="space-y-2 border-t border-neutral-200 pt-2"
              >
                <div>
                  <label
                    className="block text-small text-neutral-600"
                    htmlFor="new-budget-name"
                  >
                    Name
                  </label>
                  <input
                    id="new-budget-name"
                    name="name"
                    required
                    autoFocus
                    className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                  />
                </div>
                <div>
                  <label
                    className="block text-small text-neutral-600"
                    htmlFor="new-budget-currency"
                  >
                    Currency
                  </label>
                  <select
                    id="new-budget-currency"
                    name="currency"
                    defaultValue={availableCurrencies[0]?.code}
                    className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                  >
                    {availableCurrencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded bg-brand-700 px-2 py-1 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {pending ? "Creating…" : "Create"}
                  </button>
                </div>
              </form>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

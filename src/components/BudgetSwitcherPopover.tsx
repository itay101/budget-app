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
 *
 * The header button doubles as a rename control for the current budget
 * (via the pencil icon beside it) — e.g. "My main budget (₪)", where the
 * currency symbol is shown but not itself editable: it's fixed for a
 * budget's lifetime by createBudget's uniqueness guard.
 *
 * Each row in the budget list also has a delete (trash) icon — deletion
 * is deliberately hard to trigger by accident, requiring you to type the
 * budget's exact name to confirm (deleteBudget enforces the same check
 * server-side, since this popover isn't the only way to call it).
 */
export function BudgetSwitcherPopover({
  currentBudget,
  currencySymbol,
  budgets,
  availableCurrencies,
  switchBudget,
  createBudget,
  renameBudget,
  deleteBudget,
}: {
  currentBudget: BudgetOption;
  currencySymbol: string;
  budgets: BudgetOption[];
  availableCurrencies: CurrencyOption[];
  switchBudget: (formData: FormData) => Promise<void>;
  createBudget: (formData: FormData) => Promise<void>;
  renameBudget: (formData: FormData) => Promise<void>;
  deleteBudget: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentBudget.name);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setNameDraft(currentBudget.name);
  }, [currentBudget.id, currentBudget.name]);

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
      setDeletingId(null);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setAdding(false);
        setDeletingId(null);
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

  function cancelRename() {
    setRenaming(false);
    setNameDraft(currentBudget.name);
  }

  function handleRenameSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === currentBudget.name) {
      cancelRename();
      return;
    }
    const formData = new FormData();
    formData.set("budgetId", currentBudget.id);
    formData.set("name", trimmed);
    startTransition(async () => {
      await renameBudget(formData);
      setRenaming(false);
    });
  }

  function handleDelete(budgetId: string) {
    const formData = new FormData();
    formData.set("budgetId", budgetId);
    formData.set("confirmName", confirmText);
    startTransition(async () => {
      await deleteBudget(formData);
      setDeletingId(null);
      setConfirmText("");
      setOpen(false);
    });
  }

  return (
    <>
      {renaming ? (
        <form onSubmit={handleRenameSubmit} className="flex items-center gap-1">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelRename();
            }}
            autoFocus
            aria-label="Budget name"
            className="min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-small focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          />
          <button
            type="submit"
            disabled={pending}
            title="Save"
            className="shrink-0 rounded px-1.5 py-1 text-small text-brand-700 hover:bg-brand-700/10"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={cancelRename}
            title="Cancel"
            className="shrink-0 rounded px-1.5 py-1 text-small text-neutral-600 hover:bg-neutral-100"
          >
            ✕
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-1">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex min-w-0 flex-1 items-center rounded border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-left text-small font-medium hover:bg-neutral-100"
          >
            <span className="truncate text-neutral-800">
              {currentBudget.name}{" "}
              <span className="text-neutral-600">({currencySymbol})</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setRenaming(true);
            }}
            title="Rename budget"
            className="shrink-0 rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            ✎
          </button>
        </div>
      )}

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
              {budgets.map((b) =>
                deletingId === b.id ? (
                  <li
                    key={b.id}
                    className="space-y-1.5 rounded border border-danger/40 bg-danger/5 p-2"
                  >
                    <p className="text-small text-neutral-800">
                      Type <span className="font-semibold">{b.name}</span> to
                      delete it. Its accounts will be closed; nothing is
                      removed from the database yet.
                    </p>
                    <input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      autoFocus
                      placeholder={b.name}
                      aria-label={`Type "${b.name}" to confirm deletion`}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-small focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingId(null);
                          setConfirmText("");
                        }}
                        className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={confirmText !== b.name || pending}
                        onClick={() => handleDelete(b.id)}
                        className="rounded bg-danger px-2 py-1 text-small font-medium text-white hover:bg-danger/90 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={b.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleSwitch(b.id)}
                      className={
                        "flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-2 py-1 text-small " +
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
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingId(b.id);
                        setConfirmText("");
                      }}
                      title="Delete budget"
                      className="shrink-0 rounded p-1 text-neutral-400 hover:bg-danger/10 hover:text-danger"
                    >
                      🗑
                    </button>
                  </li>
                ),
              )}
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

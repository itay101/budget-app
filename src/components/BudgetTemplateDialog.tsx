"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { useServerAction } from "@/components/useServerAction";
import { BUDGET_TEMPLATES, DEFAULT_TEMPLATE_ID, getBudgetTemplate } from "@/lib/budgetTemplates";

const BLANK_TEMPLATE_ID = "blank";
const GALLERY = BUDGET_TEMPLATES.filter((t) => t.id !== BLANK_TEMPLATE_ID);

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function sizeLabel(groups: readonly { categories: readonly string[] }[]) {
  const categories = groups.reduce((sum, g) => sum + g.categories.length, 0);
  return `${plural(groups.length, "group", "groups")} · ${plural(categories, "category", "categories")}`;
}

/**
 * How a new budget starts (#212): a gallery of template tiles (Beginner
 * preselected) with the selected template's groups and categories
 * previewed alongside, then "Pick <template>" or "Start Blank" creates
 * the budget. Rendered by BudgetSwitcherList once its form has the name
 * and currency, outside the switcher popover, whose outside-click
 * dismissal would otherwise close it.
 */
export function BudgetTemplateDialog({
  budget,
  createBudget,
  onClose,
}: {
  budget: { name: string; currency: string };
  createBudget: (formData: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const selected = getBudgetTemplate(templateId) ?? GALLERY[0];
  const { run, pending, error } = useServerAction(createBudget);

  async function pick(template: string) {
    try {
      await run({ ...budget, template });
      onClose();
    } catch {
      // error is surfaced via `error`, in the footer
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, pending]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-800/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-template-title"
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-neutral-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-300 py-200">
          <h2 id="budget-template-title" className="text-h3 font-semibold text-neutral-800">
            How should “{budget.name}” start?
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            title="Close"
            className="rounded-sm p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
          >
            <Icon name="close" label="Close" className="text-h3" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-5">
          <div
            role="radiogroup"
            aria-label="Templates"
            className="grid min-h-0 auto-rows-min grid-cols-1 gap-2 overflow-y-auto p-300 sm:grid-cols-2 md:col-span-3"
          >
            {GALLERY.map((t) => {
              const isSelected = t.id === selected.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setTemplateId(t.id)}
                  className={
                    "rounded-md border p-2 text-left focus:outline-hidden focus:ring-1 focus:ring-brand-700 " +
                    (isSelected
                      ? "border-brand-700 bg-brand-700/10"
                      : "border-neutral-200 hover:bg-neutral-50")
                  }
                >
                  <span className="block text-body font-medium text-neutral-800">{t.name}</span>
                  <span className="mt-0.5 block text-small text-neutral-600">{t.description}</span>
                  <span className="mt-1 block text-small text-neutral-400">
                    {sizeLabel(t.groups)}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            role="region"
            aria-label={`${selected.name} categories`}
            className="min-h-0 overflow-y-auto border-t border-neutral-200 bg-neutral-50 p-300 md:col-span-2 md:border-l md:border-t-0"
          >
            <h3 className="text-body font-semibold text-neutral-800">{selected.name}</h3>
            {selected.groups.map((group) => (
              <div key={group.name} className="mt-2">
                <p className="text-small font-medium text-neutral-800">{group.name}</p>
                <ul className="pl-2 text-small text-neutral-600">
                  {group.categories.map((category) => (
                    <li key={category}>{category}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 px-300 py-200">
          {error && (
            <p role="alert" className="mr-auto text-small text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => pick(BLANK_TEMPLATE_ID)}
            disabled={pending}
            className="rounded-sm border border-neutral-200 px-3 py-1.5 text-small font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50"
          >
            Start Blank
          </button>
          <button
            type="button"
            onClick={() => pick(selected.id)}
            disabled={pending}
            className="rounded-sm bg-brand-700 px-3 py-1.5 text-small font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {pending ? "Creating…" : `Pick ${selected.name}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

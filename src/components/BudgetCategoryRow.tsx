"use client";

import { useState, type HTMLAttributes, type ReactNode } from "react";
import type { BudgetCategoryRow as Row } from "@/lib/budget";
import { CategoryAmountCells } from "@/components/CategoryAmountCells";
import { TargetCell } from "@/components/TargetCell";
import { TargetEditor, type TargetActions } from "@/components/TargetEditor";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

/** The row grid: stacked on phones, the name row plus a full-width
 * target line from `sm`, and Category · Target · Budgeted · Activity ·
 * Available from `lg` (tailwind.config.ts's `budget` templates, which the
 * page's header row uses too). Keeps `grid-cols-2`, which the e2e specs
 * find a row by. */
const ROW_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-2 border-b border-neutral-100 px-200 py-3 text-body sm:grid-cols-budget sm:items-center sm:gap-2 sm:py-2 lg:grid-cols-budget-targets lg:gap-x-4";

/**
 * One category row of the budget table, shared by CategoryGroupSection and
 * HiddenCategoriesSection: the section's own name cell, the Target cell
 * (#171), and the money cells. The Target cell opens the target editor in
 * place, below the row's grid rather than inside it, so a row still holds
 * just one Budgeted input and one Save button.
 */
export function BudgetCategoryRow({
  category,
  nameCell,
  month,
  currency,
  setBudgeted,
  transferAvailable,
  targetActions,
  categoryOptions,
  className = "",
  ...rowProps
}: {
  category: Row;
  nameCell: ReactNode;
  /** The viewed Budget Month, `YYYY-MM`. */
  month: string;
  currency: string;
  setBudgeted: (formData: FormData) => Promise<void>;
  transferAvailable: (formData: FormData) => Promise<void>;
  targetActions: TargetActions;
  categoryOptions: GroupOption[];
} & HTMLAttributes<HTMLDivElement>) {
  const [editing, setEditing] = useState(false);

  return (
    <div>
      <div {...rowProps} className={`${ROW_GRID} ${className}`}>
        {nameCell}
        <TargetCell
          row={category}
          status={category.status}
          month={month}
          currency={currency}
          open={editing}
          onToggle={() => setEditing((open) => !open)}
        />
        <CategoryAmountCells
          category={category}
          month={month}
          currency={currency}
          setBudgeted={setBudgeted}
          transferAvailable={transferAvailable}
          categoryOptions={categoryOptions}
        />
      </div>
      {editing && (
        <TargetEditor
          categoryId={category.id}
          row={category}
          history={category.history}
          snoozed={category.snoozed}
          month={month}
          currency={currency}
          actions={targetActions}
          onDone={() => setEditing(false)}
        />
      )}
    </div>
  );
}

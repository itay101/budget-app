"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { BudgetCategoryRow } from "@/components/BudgetCategoryRow";
import { CategoryRenameForm } from "@/components/CategoryRenameForm";
import type { TargetActions } from "@/components/TargetEditor";
import { useServerAction } from "@/components/useServerAction";
import type { BudgetCategoryRow as Row } from "@/lib/budget";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

type HiddenCategoryRow = Row & {
  // The real category group this category belongs to — hiding doesn't
  // move it, so unhiding puts it right back here.
  groupName: string;
};

/**
 * The synthetic "Hidden" section at the end of the budget page, collecting
 * every hidden category from every real group. It's protected: unlike a
 * real CategoryGroupSection, there's no renaming or deleting the section
 * itself, no adding a category directly into it, and no drag-and-drop —
 * the only way a category leaves is the eye icon, which unhides it back
 * into its real group at its original position (see setCategoryHidden).
 *
 * The budget page only renders this at all when it's non-empty, and only
 * under the All quick filter (#171), collapsed to "Hidden (n)" since All
 * leaves hidden categories out of the budget itself; the other filters
 * list hidden categories in their real groups instead.
 */
export function HiddenCategoriesSection({
  categories,
  month,
  currency,
  renameCategory,
  setBudgeted,
  setCategoryHidden,
  transferAvailable,
  targetActions,
  categoryOptions,
}: {
  categories: HiddenCategoryRow[];
  month: string;
  currency: string;
  renameCategory: (formData: FormData) => Promise<void>;
  setBudgeted: (formData: FormData) => Promise<void>;
  setCategoryHidden: (formData: FormData) => Promise<void>;
  transferAvailable: (formData: FormData) => Promise<void>;
  targetActions: TargetActions;
  categoryOptions: GroupOption[];
}) {
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(
    null,
  );
  const unhideAction = useServerAction(setCategoryHidden);

  function handleUnhide(categoryId: string) {
    unhideAction.run({ categoryId, hidden: "false" }).catch(() => {
      // error is surfaced via unhideAction.error
    });
  }

  function categoryNameCell(category: HiddenCategoryRow) {
    return renamingCategoryId === category.id ? (
      <CategoryRenameForm
        category={category}
        renameCategory={renameCategory}
        onClose={() => setRenamingCategoryId(null)}
      />
    ) : (
      <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-neutral-800 sm:col-span-1">
        <span className="min-w-[5rem] truncate" title={`${category.name} — ${category.groupName}`}>
          <bdi>{category.name}</bdi>
        </span>
        <span className="min-w-0 truncate text-small font-normal text-neutral-400 lg:hidden 2xl:inline">
          — <bdi>{category.groupName}</bdi>
        </span>
        <button
          type="button"
          onClick={() => setRenamingCategoryId(category.id)}
          title="Rename category"
          className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <Icon name="edit" label="Rename category" />
        </button>
        <button
          type="button"
          onClick={() => handleUnhide(category.id)}
          disabled={unhideAction.pending}
          title="Unhide category"
          className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 disabled:opacity-50"
        >
          <Icon name="visibility" label="Unhide category" />
        </button>
      </div>
    );
  }

  return (
    <details>
      <summary className="flex cursor-pointer list-none items-center gap-2 bg-neutral-100 px-200 py-1.5 text-small font-semibold uppercase tracking-wide text-neutral-600">
        <Icon name="chevron_right" className="transition-transform [details[open]_&]:rotate-90" />
        <span>Hidden ({categories.length})</span>
        <span
          title="Hidden categories keep their spot in their real group — unhide one to bring it back"
          className="text-neutral-400"
        >
          <Icon name="lock" label="Hidden categories keep their spot in their real group — unhide one to bring it back" />
        </span>
      </summary>

      {unhideAction.error && (
        <p className="bg-danger/10 px-200 py-1 text-small text-danger">
          {unhideAction.error}
        </p>
      )}

      {categories.map((category) => (
        <BudgetCategoryRow
          key={category.id}
          category={category}
          month={month}
          currency={currency}
          setBudgeted={setBudgeted}
          transferAvailable={transferAvailable}
          targetActions={targetActions}
          categoryOptions={categoryOptions}
          nameCell={categoryNameCell(category)}
        />
      ))}
    </details>
  );
}

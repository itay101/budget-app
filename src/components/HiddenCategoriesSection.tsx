"use client";

import { useState, useTransition } from "react";
import { formatMilliunits, milliunitsToNumber } from "@/lib/money";
import { MoneyInput } from "@/components/MoneyInput";
import { MoveMoneyPopover } from "@/components/MoveMoneyPopover";
import { Icon } from "@/components/Icon";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

type HiddenCategoryRow = {
  id: string;
  name: string;
  // The real category group this category belongs to — hiding doesn't
  // move it, so unhiding puts it right back here.
  groupName: string;
  budgeted: number;
  activity: number;
  available: number;
};

const nameInputClass =
  "min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-small focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700";

/**
 * The synthetic "Hidden" section at the end of the budget page, collecting
 * every hidden category from every real group. It's protected: unlike a
 * real CategoryGroupSection, there's no renaming or deleting the section
 * itself, no adding a category directly into it, and no drag-and-drop —
 * the only way a category leaves is the eye icon, which unhides it back
 * into its real group at its original position (see setCategoryHidden).
 *
 * The budget page only renders this at all when it's non-empty.
 */
export function HiddenCategoriesSection({
  categories,
  month,
  currency,
  renameCategory,
  setBudgeted,
  setCategoryHidden,
  transferAvailable,
  categoryOptions,
}: {
  categories: HiddenCategoryRow[];
  month: string;
  currency: string;
  renameCategory: (formData: FormData) => Promise<void>;
  setBudgeted: (formData: FormData) => Promise<void>;
  setCategoryHidden: (formData: FormData) => Promise<void>;
  transferAvailable: (formData: FormData) => Promise<void>;
  categoryOptions: GroupOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(
    null,
  );
  const [categoryNameDraft, setCategoryNameDraft] = useState("");

  function startCategoryRename(category: HiddenCategoryRow) {
    setRenamingCategoryId(category.id);
    setCategoryNameDraft(category.name);
  }

  function cancelCategoryRename() {
    setRenamingCategoryId(null);
  }

  function handleCategoryRenameSubmit(
    e: React.FormEvent<HTMLFormElement>,
    category: HiddenCategoryRow,
  ) {
    e.preventDefault();
    const trimmed = categoryNameDraft.trim();
    if (!trimmed || trimmed === category.name) {
      cancelCategoryRename();
      return;
    }
    const formData = new FormData();
    formData.set("categoryId", category.id);
    formData.set("name", trimmed);
    startTransition(async () => {
      await renameCategory(formData);
      setRenamingCategoryId(null);
    });
  }

  function handleUnhide(categoryId: string) {
    const formData = new FormData();
    formData.set("categoryId", categoryId);
    formData.set("hidden", "false");
    startTransition(async () => {
      await setCategoryHidden(formData);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 bg-neutral-100 px-200 py-1.5 text-small font-semibold uppercase tracking-wide text-neutral-600">
        <span>Hidden</span>
        <span
          title="Hidden categories keep their spot in their real group — unhide one to bring it back"
          className="text-neutral-400"
        >
          <Icon name="lock" label="Hidden categories keep their spot in their real group — unhide one to bring it back" />
        </span>
      </div>

      {categories.map((category) => (
        <div
          key={category.id}
          className="grid grid-cols-[1fr_120px_120px_120px] items-center gap-2 border-b border-neutral-100 px-200 py-2 text-body last:border-b-0"
        >
          {renamingCategoryId === category.id ? (
            <form
              onSubmit={(e) => handleCategoryRenameSubmit(e, category)}
              className="flex items-center gap-1"
            >
              <input
                value={categoryNameDraft}
                onChange={(e) => setCategoryNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelCategoryRename();
                }}
                autoFocus
                aria-label="Category name"
                className={nameInputClass}
              />
              <button
                type="submit"
                disabled={pending}
                title="Save"
                className="shrink-0 rounded px-1.5 py-1 text-small text-brand-700 hover:bg-brand-700/10 disabled:opacity-50"
              >
                <Icon name="check" label="Save" />
              </button>
              <button
                type="button"
                onClick={cancelCategoryRename}
                title="Cancel"
                className="shrink-0 rounded px-1.5 py-1 text-small text-neutral-600 hover:bg-neutral-100"
              >
                <Icon name="close" label="Cancel" />
              </button>
            </form>
          ) : (
            <div className="flex min-w-0 items-center gap-1.5 text-neutral-800">
              <span className="truncate">{category.name}</span>
              <span className="shrink-0 truncate text-small font-normal text-neutral-400">
                — {category.groupName}
              </span>
              <button
                type="button"
                onClick={() => startCategoryRename(category)}
                title="Rename category"
                className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              >
                <Icon name="edit" label="Rename category" />
              </button>
              <button
                type="button"
                onClick={() => handleUnhide(category.id)}
                disabled={pending}
                title="Unhide category"
                className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 disabled:opacity-50"
              >
                <Icon name="visibility" label="Unhide category" />
              </button>
            </div>
          )}
          <form
            action={setBudgeted}
            className="flex items-center justify-end gap-1"
          >
            <input type="hidden" name="categoryId" value={category.id} />
            <input type="hidden" name="month" value={month} />
            <MoneyInput
              name="amount"
              currency={currency}
              defaultValue={milliunitsToNumber(category.budgeted)}
              className="w-24 rounded border border-neutral-200 px-2 py-1 text-right text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            />
            <button
              type="submit"
              className="rounded px-1.5 py-1 text-small text-brand-700 hover:bg-brand-700/10"
              title="Save"
            >
              <Icon name="check" label="Save" />
            </button>
          </form>
          <div className="text-right text-neutral-800">
            {formatMilliunits(category.activity, currency)}
          </div>
          <div className="text-right">
            <MoveMoneyPopover
              categoryId={category.id}
              categoryName={category.name}
              month={month}
              currency={currency}
              available={category.available}
              groups={categoryOptions}
              transferAvailable={transferAvailable}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

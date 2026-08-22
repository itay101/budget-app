"use client";

import { useState, useTransition } from "react";
import { formatMilliunits, milliunitsToNumber } from "@/lib/money";
import { MoneyInput } from "@/components/MoneyInput";
import { MoveMoneyPopover } from "@/components/MoveMoneyPopover";
import { AddCategoryPopover } from "@/components/AddCategoryPopover";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

type CategoryRow = {
  id: string;
  name: string;
  budgeted: number;
  activity: number;
  available: number;
};

// The dataTransfer MIME type used to carry a dragged category's id between
// CategoryGroupSection instances — every group renders one of these, and a
// drag started in one has to be readable by the onDrop of any other.
const DRAG_TYPE = "application/x-category-id";

/**
 * One category group's header + category rows on the budget page.
 *
 * Owns drag-and-drop for its categories: each row is draggable by its grip
 * handle, and both individual rows (drop = insert before) and the group's
 * body (drop on empty space = append to the end) are drop targets, backed
 * by the `moveCategory` action. This covers both reordering within a group
 * and moving a category into a different group — dropping into another
 * group's section calls the same action with that group's id.
 */
export function CategoryGroupSection({
  groupId,
  groupName,
  categories,
  month,
  currency,
  createCategory,
  deleteCategoryGroup,
  moveCategory,
  setBudgeted,
  transferAvailable,
  categoryOptions,
}: {
  groupId: string;
  groupName: string;
  categories: CategoryRow[];
  month: string;
  currency: string;
  createCategory: (formData: FormData) => Promise<void>;
  deleteCategoryGroup: (formData: FormData) => Promise<void>;
  moveCategory: (formData: FormData) => Promise<void>;
  setBudgeted: (formData: FormData) => Promise<void>;
  transferAvailable: (formData: FormData) => Promise<void>;
  categoryOptions: GroupOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [groupDragOver, setGroupDragOver] = useState(false);

  function move(categoryId: string, beforeCategoryId: string | null) {
    const formData = new FormData();
    formData.set("categoryId", categoryId);
    formData.set("targetGroupId", groupId);
    if (beforeCategoryId) formData.set("beforeCategoryId", beforeCategoryId);
    startTransition(async () => {
      await moveCategory(formData);
    });
  }

  function handleDeleteGroup() {
    if (
      !window.confirm(`Delete the "${groupName}" category group? This can't be undone.`)
    ) {
      return;
    }
    const formData = new FormData();
    formData.set("categoryGroupId", groupId);
    startTransition(async () => {
      await deleteCategoryGroup(formData);
    });
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setGroupDragOver(true);
      }}
      onDragLeave={() => setGroupDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setGroupDragOver(false);
        const draggedId = e.dataTransfer.getData(DRAG_TYPE);
        if (!draggedId) return;
        move(draggedId, null);
      }}
      className={groupDragOver ? "bg-brand-700/5" : undefined}
    >
      <div className="flex items-center gap-2 bg-neutral-100 px-200 py-1.5 text-small font-semibold uppercase tracking-wide text-neutral-600">
        <span>{groupName}</span>
        <AddCategoryPopover
          categoryGroupId={groupId}
          createCategory={createCategory}
        />
        {categories.length === 0 && (
          <button
            type="button"
            onClick={handleDeleteGroup}
            disabled={pending}
            title="Delete empty category group"
            className="rounded p-1 text-neutral-400 normal-case tracking-normal hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            🗑
          </button>
        )}
      </div>

      {categories.map((category) => (
        <div
          key={category.id}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverId(category.id);
          }}
          onDragLeave={() =>
            setDragOverId((id) => (id === category.id ? null : id))
          }
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOverId(null);
            const draggedId = e.dataTransfer.getData(DRAG_TYPE);
            if (!draggedId || draggedId === category.id) return;
            move(draggedId, category.id);
          }}
          className={
            "grid grid-cols-[1fr_120px_120px_120px] items-center gap-2 border-b border-neutral-100 px-200 py-2 text-body last:border-b-0 " +
            (dragOverId === category.id
              ? "border-t-2 border-t-brand-700"
              : "")
          }
        >
          <div className="flex items-center gap-1.5 text-neutral-800">
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, category.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              title="Drag to reorder or move to another group"
              className="cursor-grab select-none text-neutral-400 hover:text-neutral-600 active:cursor-grabbing"
            >
              ⠿
            </span>
            <span className="truncate">{category.name}</span>
          </div>
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
              ✓
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

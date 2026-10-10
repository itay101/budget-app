"use client";

import { useState } from "react";
import { AddCategoryPopover } from "@/components/AddCategoryPopover";
import { Icon } from "@/components/Icon";
import { BudgetCategoryRow } from "@/components/BudgetCategoryRow";
import { CategoryRenameForm } from "@/components/CategoryRenameForm";
import type { TargetActions } from "@/components/TargetEditor";
import { useServerAction } from "@/components/useServerAction";
import { formatMilliunitsLtr } from "@/lib/money";
import { totalNeeded } from "@/lib/targetDisplay";
import type { BudgetCategoryRow as CategoryRow } from "@/lib/budget";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

// The dataTransfer MIME type used to carry a dragged category's id between
// CategoryGroupSection instances — every group renders one of these, and a
// drag started in one has to be readable by the onDrop of any other.
const DRAG_TYPE = "application/x-category-id";

const nameInputClass =
  "min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-small focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700";

/**
 * One category group's header + category rows on the budget page.
 *
 * Owns drag-and-drop for its categories: each row is draggable by its grip
 * handle, and both individual rows (drop = insert before) and the group's
 * body (drop on empty space = append to the end) are drop targets, backed
 * by the `moveCategory` action. This covers both reordering within a group
 * and moving a category into a different group — dropping into another
 * group's section calls the same action with that group's id.
 *
 * Also owns renaming, both for the group itself and for each category —
 * a pencil icon toggles an inline input + ✓/✕ (same pattern as the
 * sidebar's budget rename control).
 *
 * Each row has a Target cell (#171) that expands the row's target editor
 * in place, below the row's grid. Under a quick filter other than All the
 * section also lists the group's matching hidden categories, marked with
 * an icon and with Unhide in place of Hide.
 */
export function CategoryGroupSection({
  groupId,
  groupName,
  categories,
  isEmpty,
  month,
  currency,
  createCategory,
  renameCategoryGroup,
  renameCategory,
  deleteCategoryGroup,
  moveCategory,
  setBudgeted,
  setCategoryHidden,
  transferAvailable,
  targetActions,
  categoryOptions,
}: {
  groupId: string;
  groupName: string;
  categories: CategoryRow[];
  // Whether the group has *no* categories at all — including hidden ones,
  // which are filtered out of `categories` for display but still count.
  // Drives the delete button: a group holding only hidden categories isn't
  // really empty, even though it renders with no visible rows.
  isEmpty: boolean;
  month: string;
  currency: string;
  createCategory: (formData: FormData) => Promise<void>;
  renameCategoryGroup: (formData: FormData) => Promise<void>;
  renameCategory: (formData: FormData) => Promise<void>;
  deleteCategoryGroup: (formData: FormData) => Promise<void>;
  moveCategory: (formData: FormData) => Promise<void>;
  setBudgeted: (formData: FormData) => Promise<void>;
  setCategoryHidden: (formData: FormData) => Promise<void>;
  transferAvailable: (formData: FormData) => Promise<void>;
  targetActions: TargetActions;
  categoryOptions: GroupOption[];
}) {
  const needed = totalNeeded(categories);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [groupDragOver, setGroupDragOver] = useState(false);

  const [groupRenaming, setGroupRenaming] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(groupName);

  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(
    null,
  );

  const moveAction = useServerAction(moveCategory);
  const deleteGroupAction = useServerAction(deleteCategoryGroup);
  const renameGroupAction = useServerAction(renameCategoryGroup);
  const hideCategoryAction = useServerAction(setCategoryHidden);

  const pending =
    moveAction.pending ||
    deleteGroupAction.pending ||
    renameGroupAction.pending ||
    hideCategoryAction.pending;
  const error =
    moveAction.error ||
    deleteGroupAction.error ||
    renameGroupAction.error ||
    hideCategoryAction.error;

  function move(categoryId: string, beforeCategoryId: string | null) {
    moveAction
      .run({
        categoryId,
        targetGroupId: groupId,
        beforeCategoryId: beforeCategoryId ?? undefined,
      })
      .catch(() => {
        // error is surfaced via moveAction.error
      });
  }

  function handleDeleteGroup() {
    if (
      !window.confirm(`Delete the "${groupName}" category group? This can't be undone.`)
    ) {
      return;
    }
    deleteGroupAction.run({ categoryGroupId: groupId }).catch(() => {
      // error is surfaced via deleteGroupAction.error
    });
  }

  function cancelGroupRename() {
    setGroupRenaming(false);
    setGroupNameDraft(groupName);
  }

  async function handleGroupRenameSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = groupNameDraft.trim();
    if (!trimmed || trimmed === groupName) {
      cancelGroupRename();
      return;
    }
    try {
      await renameGroupAction.run({ categoryGroupId: groupId, name: trimmed });
      setGroupRenaming(false);
    } catch {
      // error is surfaced via renameGroupAction.error
    }
  }

  async function handleHideCategory(categoryId: string, hidden: boolean) {
    try {
      await hideCategoryAction.run({ categoryId, hidden: String(hidden) });
      setRenamingCategoryId(null);
    } catch {
      // error is surfaced via hideCategoryAction.error
    }
  }

  function categoryNameCell(category: CategoryRow) {
    return renamingCategoryId === category.id ? (
      <CategoryRenameForm
        category={category}
        renameCategory={renameCategory}
        onClose={() => setRenamingCategoryId(null)}
        extra={
          <HideToggleButton
            hidden={category.hidden}
            disabled={pending}
            onClick={() => handleHideCategory(category.id, !category.hidden)}
          />
        }
      />
    ) : (
      <div className="group col-span-2 flex items-center gap-1.5 text-neutral-800 sm:col-span-1">
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, category.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          title="Drag to reorder or move to another group"
          className="shrink-0 cursor-grab select-none text-neutral-400 hover:text-neutral-600 active:cursor-grabbing"
        >
          <Icon name="drag_indicator" label="Drag to reorder or move to another group" />
        </span>
        <span className="truncate">
          <bdi>{category.name}</bdi>
        </span>
        {category.hidden && (
          <span title="Hidden category" className="shrink-0 text-neutral-400">
            <Icon name="visibility_off" label="Hidden category" />
          </span>
        )}
        <button
          type="button"
          onClick={() => setRenamingCategoryId(category.id)}
          title="Rename or hide category"
          className="shrink-0 rounded p-1 text-neutral-400 opacity-0 hover:bg-neutral-100 hover:text-neutral-600 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <Icon name="edit" label="Rename or hide category" />
        </button>
      </div>
    );
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
      {error && (
        <p className="bg-danger/10 px-200 py-1 text-small text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 bg-neutral-100 px-200 py-1.5 text-small font-semibold uppercase tracking-wide text-neutral-600">
        {groupRenaming ? (
          <form
            onSubmit={handleGroupRenameSubmit}
            className="flex min-w-0 flex-1 items-center gap-1 normal-case tracking-normal"
          >
            <input
              value={groupNameDraft}
              onChange={(e) => setGroupNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelGroupRename();
              }}
              autoFocus
              aria-label="Category group name"
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
              onClick={cancelGroupRename}
              title="Cancel"
              className="shrink-0 rounded px-1.5 py-1 text-small text-neutral-600 hover:bg-neutral-100"
            >
              <Icon name="close" label="Cancel" />
            </button>
          </form>
        ) : (
          <>
            <span>{groupName}</span>
            <button
              type="button"
              onClick={() => {
                setGroupNameDraft(groupName);
                setGroupRenaming(true);
              }}
              title="Rename category group"
              className="rounded p-1 text-neutral-400 normal-case tracking-normal hover:bg-neutral-200 hover:text-neutral-600"
            >
              <Icon name="edit" label="Rename category group" />
            </button>
            <AddCategoryPopover
              categoryGroupId={groupId}
              createCategory={createCategory}
            />
            {isEmpty && (
              <button
                type="button"
                onClick={handleDeleteGroup}
                disabled={pending}
                title="Delete empty category group"
                className="rounded p-1 text-neutral-400 normal-case tracking-normal hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              >
                <Icon name="delete" label="Delete empty category group" />
              </button>
            )}
            {needed > 0 && (
              <span className="ms-auto whitespace-nowrap normal-case tracking-normal text-target-underfunded-fg">
                {formatMilliunitsLtr(needed, currency)} needed
              </span>
            )}
          </>
        )}
      </div>

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
          className={dragOverId === category.id ? "border-t-2 border-t-brand-700" : ""}
          nameCell={categoryNameCell(category)}
        />
      ))}
    </div>
  );
}

/** Hide, or Unhide for a hidden category a quick filter is showing. */
function HideToggleButton({ hidden, disabled, onClick }: { hidden: boolean; disabled: boolean; onClick: () => void }) {
  const label = hidden ? "Unhide category" : "Hide category";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 disabled:opacity-50"
    >
      <Icon name={hidden ? "visibility" : "visibility_off"} label={label} />
    </button>
  );
}

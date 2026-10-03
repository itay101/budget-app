"use client";

import { AddFormPopover } from "@/components/AddFormPopover";

/**
 * The "+ Add" button next to a category group's name, opening a small
 * popover (same pattern as AddCategoryGroupPopover) with the
 * create-category form, instead of the inline text-input-plus-button form
 * that used to sit at the far right of the group's header row.
 */
export function AddCategoryPopover({
  categoryGroupId,
  createCategory,
}: {
  categoryGroupId: string;
  createCategory: (formData: FormData) => Promise<void>;
}) {
  return (
    <AddFormPopover
      triggerLabel="Add"
      triggerClassName="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-small font-medium normal-case tracking-normal text-brand-700 hover:bg-brand-700/10"
      title="Add category"
      submitLabel="Add category"
      onSubmit={createCategory}
    >
      <input type="hidden" name="categoryGroupId" value={categoryGroupId} />
      <div>
        <label
          className="block text-small text-neutral-600"
          htmlFor={`new-category-name-${categoryGroupId}`}
        >
          Name
        </label>
        <input
          id={`new-category-name-${categoryGroupId}`}
          name="name"
          required
          autoFocus
          className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
        />
      </div>
    </AddFormPopover>
  );
}

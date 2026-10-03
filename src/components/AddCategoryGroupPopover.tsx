"use client";

import { AddFormPopover } from "@/components/AddFormPopover";

/**
 * The "+ Add" button on the budget table's "Category" column header,
 * opening a small popover (same pattern as AddAccountPopover/
 * MoveMoneyPopover) with the create-category-group form, instead of the
 * standalone "Add category group" box that used to sit below the table.
 */
export function AddCategoryGroupPopover({
  createCategoryGroup,
}: {
  createCategoryGroup: (formData: FormData) => Promise<void>;
}) {
  return (
    <AddFormPopover
      triggerLabel="Add"
      triggerClassName="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-small font-medium normal-case tracking-normal text-brand-700 hover:bg-brand-700/10"
      title="Add category group"
      submitLabel="Add category group"
      onSubmit={createCategoryGroup}
    >
      <div>
        <label
          className="block text-small text-neutral-600"
          htmlFor="new-group-name"
        >
          Name
        </label>
        <input
          id="new-group-name"
          name="name"
          required
          autoFocus
          className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
        />
      </div>
    </AddFormPopover>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { useServerAction } from "@/components/useServerAction";

const nameInputClass =
  "min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-small focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700";

/**
 * A budget row's inline category rename: an input + ✓/✕, the same pattern
 * as the group and budget renames. Shared by CategoryGroupSection and
 * HiddenCategoriesSection; `extra` slots in a section's own button (Hide
 * or Unhide) between ✓ and ✕. Saving an unchanged or blank name just
 * closes it.
 */
export function CategoryRenameForm({
  category,
  renameCategory,
  onClose,
  extra,
}: {
  category: { id: string; name: string };
  renameCategory: (formData: FormData) => Promise<void>;
  onClose: () => void;
  extra?: ReactNode;
}) {
  const [draft, setDraft] = useState(category.name);
  const rename = useServerAction(renameCategory);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || trimmed === category.name) {
      onClose();
      return;
    }
    try {
      await rename.run({ categoryId: category.id, name: trimmed });
      onClose();
    } catch {
      // error is surfaced via rename.error
    }
  }

  return (
    <form onSubmit={handleSubmit} className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        autoFocus
        aria-label="Category name"
        className={nameInputClass}
      />
      <button
        type="submit"
        disabled={rename.pending}
        title="Save"
        className="shrink-0 rounded px-1.5 py-1 text-small text-brand-700 hover:bg-brand-700/10 disabled:opacity-50"
      >
        <Icon name="check" label="Save" />
      </button>
      {extra}
      <button
        type="button"
        onClick={onClose}
        title="Cancel"
        className="shrink-0 rounded px-1.5 py-1 text-small text-neutral-600 hover:bg-neutral-100"
      >
        <Icon name="close" label="Cancel" />
      </button>
      {rename.error && <p className="w-full text-small text-danger">{rename.error}</p>}
    </form>
  );
}

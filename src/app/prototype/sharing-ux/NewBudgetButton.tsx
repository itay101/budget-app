import { Icon } from "@/components/Icon";

// PROTOTYPE atom — trivial visual atom, not layout, so it's fine for all
// three variants to share it (see prototype skill: "a shared <Header> is
// fine"). This prototype narrows to the sharing flows from issue #59, so
// "create a new budget" (today's real "+ New budget" in
// BudgetSwitcherPopover, currency picker included) is deliberately left
// out of scope rather than reimplemented — this stub exists only so it
// doesn't look like the capability quietly disappeared.
export function NewBudgetButton() {
  return (
    <button
      type="button"
      disabled
      title="Out of scope for this prototype — the real switcher's currency-picker flow for creating a budget is unchanged."
      className="mt-1 flex w-full cursor-not-allowed items-center gap-1 rounded border-t border-neutral-200 px-2 pt-2 text-left text-small font-medium text-neutral-400"
    >
      <Icon name="add" /> New budget
    </button>
  );
}

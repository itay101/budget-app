import { milliunitsToNumber } from "@/lib/money";
import { MoneyInput } from "@/components/MoneyInput";
import { MoveMoneyPopover } from "@/components/MoveMoneyPopover";
import { Icon } from "@/components/Icon";
import { ActivityLink } from "@/components/ActivityLink";

type CategoryOption = { id: string; name: string; available: number };
type GroupOption = { id: string; name: string; categories: CategoryOption[] };

/**
 * A budget-page category row's three money cells (Budgeted, Activity,
 * Available), shared by CategoryGroupSection and HiddenCategoriesSection so
 * both rows stay identical. Renders as siblings to drop into the row's
 * grid; on mobile each cell gets its own small label.
 */
export function CategoryAmountCells({
  category,
  month,
  currency,
  setBudgeted,
  transferAvailable,
  categoryOptions,
}: {
  category: { id: string; name: string; budgeted: number; activity: number; available: number };
  /** The viewed Budget Month, `YYYY-MM`. */
  month: string;
  currency: string;
  setBudgeted: (formData: FormData) => Promise<void>;
  transferAvailable: (formData: FormData) => Promise<void>;
  categoryOptions: GroupOption[];
}) {
  return (
    <>
      <form
        action={setBudgeted}
        className="col-span-2 sm:col-span-1 sm:flex sm:items-center sm:justify-end sm:gap-1"
      >
        <input type="hidden" name="categoryId" value={category.id} />
        <input type="hidden" name="month" value={month} />
        <label className="mb-1 block text-small text-neutral-600 sm:hidden">
          Budgeted
        </label>
        <div className="flex items-center gap-1">
          <MoneyInput
            name="amount"
            currency={currency}
            defaultValue={milliunitsToNumber(category.budgeted)}
            className="w-full rounded border border-neutral-200 px-2 py-1 text-right text-body focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 sm:w-24"
          />
          <button
            type="submit"
            className="rounded px-1.5 py-1 text-small text-brand-700 hover:bg-brand-700/10"
            title="Save"
          >
            <Icon name="check" label="Save" />
          </button>
        </div>
      </form>
      <div className="text-neutral-800 sm:col-span-1 sm:text-right">
        <div className="text-small text-neutral-600 sm:hidden">Activity</div>
        <ActivityLink
          categoryId={category.id}
          month={month}
          amount={category.activity}
          currency={currency}
        />
      </div>
      <div className="sm:col-span-1 sm:text-right">
        <div className="text-small text-neutral-600 sm:hidden">Available</div>
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
    </>
  );
}

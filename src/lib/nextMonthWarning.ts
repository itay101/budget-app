/**
 * The Next-Month Warning (#183, #226). From the current month on, next
 * month's Ready to Assign is this month's figure, minus this month's cash
 * overspending, plus Inflow: Ready to Assign dated next month. No forecast
 * is stored: the caller passes figures the budget page already loaded.
 *
 * Credit Overspending never counts (ADR 0010). A category's
 * `creditOverspending` is accepted and ignored, so a mixed overspend
 * contributes only its cash part.
 */

/** How many cash-overspent categories the callout names before "+N more". */
export const NEXT_MONTH_WARNING_CATEGORY_LIMIT = 5;

export interface NextMonthWarningCategoryInput {
  id: string;
  name: string;
  /** Cash overspending this month, in milliunits. Zero or negative is not overspending. */
  cashOverspending: number;
  /** Credit overspending this month, in milliunits. Ignored. */
  creditOverspending?: number;
  /** Uncategorized has no Move Money popover; it links to its transactions. */
  uncategorized?: boolean;
}

export interface NextMonthWarningCategory {
  id: string;
  name: string;
  cashOverspending: number;
  uncategorized: boolean;
}

export interface NextMonthWarning {
  /** Next month's Ready to Assign, in milliunits. Negative whenever a warning is returned. */
  nextReadyToAssign: number;
  /** This month's cash overspending, in milliunits, across every category passed in. */
  cashOverspending: number;
  /** The first {@link NEXT_MONTH_WARNING_CATEGORY_LIMIT} cash-overspent categories, in the order given. */
  categories: NextMonthWarningCategory[];
  /** Cash-overspent categories left off `categories`. */
  moreCount: number;
}

export interface NextMonthWarningInput {
  /** The viewed month is before the current Budget Month. The warning is never shown then. */
  isPast: boolean;
  /** The viewed month's Ready to Assign, in milliunits. */
  readyToAssign: number;
  /** Inflow: Ready to Assign dated next month, in milliunits. An outflow here is negative. */
  nextMonthIncome: number;
  /**
   * Every category that might be cash-overspent, hidden ones and
   * Uncategorized included, in the order the callout should list them.
   */
  categories: NextMonthWarningCategoryInput[];
}

/**
 * The warning to show for a viewed month, or null when it stays hidden:
 * past months, a viewed month that's already below $0, and a next month
 * that's $0 or more.
 */
export function nextMonthWarning({
  isPast,
  readyToAssign,
  nextMonthIncome,
  categories,
}: NextMonthWarningInput): NextMonthWarning | null {
  if (isPast || readyToAssign < 0) return null;

  const cashCategories = categories.filter((category) => category.cashOverspending > 0);
  const cashOverspending = cashCategories.reduce((sum, category) => sum + category.cashOverspending, 0);
  const nextReadyToAssign = readyToAssign - cashOverspending + nextMonthIncome;
  if (nextReadyToAssign >= 0) return null;

  return {
    nextReadyToAssign,
    cashOverspending,
    categories: cashCategories.slice(0, NEXT_MONTH_WARNING_CATEGORY_LIMIT).map((category) => ({
      id: category.id,
      name: category.name,
      cashOverspending: category.cashOverspending,
      uncategorized: category.uncategorized ?? false,
    })),
    moreCount: Math.max(0, cashCategories.length - NEXT_MONTH_WARNING_CATEGORY_LIMIT),
  };
}

/**
 * Auto-Assign (#147, #219, `CONTEXT.md`): set what's assigned to many
 * categories in one Budget Month with one rule, previewed before it's
 * confirmed. Pure and client-safe: the budget page computes the preview
 * from AutoAssignCategory inputs that getBudgetMonthRows prepares, and the
 * server re-checks each row when the run is confirmed. All amounts are
 * integer milliunits.
 */

export const AUTO_ASSIGN_OPTIONS = ["underfunded"] as const;
export type AutoAssignOption = (typeof AUTO_ASSIGN_OPTIONS)[number];

export const AUTO_ASSIGN_LABELS: Record<AutoAssignOption, string> = {
  underfunded: "Underfunded",
};

/** Options that exist to add money. They're disabled when Ready to Assign is
 * $0 or below (#147), though a run can still lower some categories. */
const MONEY_ADDING: ReadonlySet<AutoAssignOption> = new Set(["underfunded"]);

export function addsMoney(option: AutoAssignOption): boolean {
  return MONEY_ADDING.has(option);
}

export function isAutoAssignOption(value: string): value is AutoAssignOption {
  return (AUTO_ASSIGN_OPTIONS as readonly string[]).includes(value);
}

/** One category's inputs for the viewed month. */
export interface AutoAssignCategory {
  id: string;
  name: string;
  groupId: string;
  hidden: boolean;
  /** The budget's display order: group first, then category. Breaks ties. */
  order: number;
  /** This month's Assigned. */
  assigned: number;
  available: number;
  /** What its Target still needs this month (0 when snoozed or none). */
  needed: number;
  /** When its Target is next due (`YYYY-MM-DD`), or null (targets.ts nextDue). */
  due: string | null;
}

/** One change a run makes: Assigned goes from `from` to `to`. */
export interface AutoAssignRow {
  categoryId: string;
  name: string;
  hidden: boolean;
  from: number;
  to: number;
  /** Funded only partly because Ready to Assign ran out. */
  partial: boolean;
}

/**
 * A category's new Assigned under `option`, before Ready to Assign caps the
 * run, or null when it wouldn't change.
 *
 * Underfunded lifts an overspent category back to $0, Target or not, then
 * adds what its Target still needs, so a full run clears the plan-level
 * Underfunded total (ADR 0011).
 */
export function proposedAssigned(option: AutoAssignOption, category: AutoAssignCategory): number | null {
  let to: number;
  switch (option) {
    case "underfunded":
      to = category.assigned + Math.max(0, -category.available) + category.needed;
      break;
  }
  return to === category.assigned ? null : to;
}

/** A slice of one category's increase, funded on its own: covering its
 * overspending, or the rest (what its Target needs, or the option's figure). */
interface Slice {
  category: AutoAssignCategory;
  amount: number;
  overspending: boolean;
}

/** Funding order when money runs short (#147): every category's overspending
 * first, then the rest by soonest Target due date, then everything undated;
 * ties by display order. */
function fundingOrder(a: Slice, b: Slice): number {
  if (a.overspending !== b.overspending) return a.overspending ? -1 : 1;
  if (a.category.due !== b.category.due) {
    if (a.category.due === null) return 1;
    if (b.category.due === null) return -1;
    return a.category.due < b.category.due ? -1 : 1;
  }
  return a.category.order - b.category.order;
}

/** Splits an increase into its overspending part (up to what lifts the
 * category back to $0) and the rest, so one category's Target can't be
 * funded ahead of another's overspending. */
function slices(category: AutoAssignCategory, wanted: number): Slice[] {
  const overspent = Math.min(wanted, Math.max(0, -category.available));
  return [
    { category, amount: overspent, overspending: true },
    { category, amount: wanted - overspent, overspending: false },
  ].filter((slice) => slice.amount > 0);
}

export interface AutoAssignPlan {
  rows: AutoAssignRow[];
  /** Net change to what's assigned: positive takes money from Ready to Assign. */
  total: number;
}

/**
 * The changes a run of `option` over `categories` makes. Decreases are
 * applied in full first, since they free money. Increases are then funded
 * in funding order until Ready to Assign, plus what the decreases freed,
 * reaches $0: each category's overspending part before anyone's Target
 * part. The last slice funded may be partial, and any left after that are
 * dropped. Rows come back in display order.
 */
export function planRun(
  option: AutoAssignOption,
  categories: readonly AutoAssignCategory[],
  readyToAssign: number,
): AutoAssignPlan {
  const changes = categories
    .map((category) => ({ category, to: proposedAssigned(option, category) }))
    .filter((c): c is { category: AutoAssignCategory; to: number } => c.to !== null);

  const decreases = changes.filter((c) => c.to < c.category.assigned);
  const increases = changes.filter((c) => c.to > c.category.assigned);

  let money = readyToAssign + decreases.reduce((sum, c) => sum + c.category.assigned - c.to, 0);
  const given = new Map<string, number>();
  const ordered = increases
    .flatMap((change) => slices(change.category, change.to - change.category.assigned))
    .sort(fundingOrder);
  for (const slice of ordered) {
    if (money <= 0) break;
    const amount = Math.min(slice.amount, money);
    money -= amount;
    given.set(slice.category.id, (given.get(slice.category.id) ?? 0) + amount);
  }
  const funded = increases
    .filter((change) => given.has(change.category.id))
    .map((change) => {
      const amount = given.get(change.category.id)!;
      return {
        category: change.category,
        to: change.category.assigned + amount,
        partial: amount < change.to - change.category.assigned,
      };
    });

  const rows = [...decreases.map((c) => ({ ...c, partial: false })), ...funded]
    .sort((a, b) => a.category.order - b.category.order)
    .map(({ category, to, partial }) => ({
      categoryId: category.id,
      name: category.name,
      hidden: category.hidden,
      from: category.assigned,
      to,
      partial,
    }));
  return { rows, total: rows.reduce((sum, row) => sum + row.to - row.from, 0) };
}

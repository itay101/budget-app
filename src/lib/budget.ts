import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import {
  effectiveTarget,
  needFor,
  planTotals,
  targetStatus,
  type PlanTotals,
  type Target,
  type TargetNeed,
  type TargetRow,
  type TargetStatus,
} from "@/lib/targets";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { accessibleBudgetWhere } from "@/lib/authorization";
import { auditedUpdate } from "@/lib/audit";
import {
  addMonths,
  currentBudgetMonth,
  formatBudgetMonth,
  isInRange,
  navigableRange,
  parseBudgetMonth,
  type BudgetMonthRange,
} from "@/lib/budgetMonth";

/**
 * This app supports multiple budgets per user — one per currency (see
 * src/app/budgets/actions.ts) — so a user can keep, say, a "Personal" USD
 * budget and a "Travel" EUR budget side by side, and can be shared with
 * Collaborators (see CONTEXT.md). Which one is "current" is tracked in
 * this cookie rather than the URL.
 */
export const CURRENT_BUDGET_COOKIE = "budgetId";

/**
 * The budget every page renders against, scoped to the signed-in user
 * (owner or collaborator — see src/lib/authorization.ts). Honors the
 * cookie set by switchBudget/createBudget when it points at a budget
 * this user can still access, otherwise falls back to their oldest
 * accessible budget — creating a default USD one, owned by them, if they
 * don't have access to any budget yet (a brand-new user's very first
 * visit), so the app still works either way.
 */
export async function getCurrentBudget() {
  const user = await getCurrentUser();
  const where = accessibleBudgetWhere(user.id);
  const selectedId = (await cookies()).get(CURRENT_BUDGET_COOKIE)?.value;

  if (selectedId) {
    const selected = await prisma.budget.findFirst({
      where: { id: selectedId, deleted: false, ...where },
    });
    if (selected) return selected;
  }

  const first = await prisma.budget.findFirst({
    where: { deleted: false, ...where },
    orderBy: { createdAt: "asc" },
  });
  if (first) return first;

  return prisma.budget.create({
    data: { name: "My Budget", currency: "USD", ownerId: user.id },
  });
}

export type BudgetSummary = {
  id: string;
  name: string;
  currency: string;
  /** Whether the signed-in user is this Budget's Owner (vs. a Collaborator). */
  isOwner: boolean;
  /** The Owner's email — only meaningful for a budget this user doesn't own. */
  ownerEmail: string;
  /** Only populated for budgets this user owns — see BudgetSwitcherPopover's
   * inline collaborator management (#76); a Collaborator doesn't get the
   * rest of a Budget's membership list handed to them (BudgetSwitcherList's
   * expanded row renders them via CollaboratorManager, #96). */
  collaborators: { userId: string; email: string }[];
  pendingInvites: { id: string; email: string }[];
};

/** Every non-deleted budget this user can access (owns or collaborates
 * on), for the sidebar's budget switcher — including, for the ones they
 * own, enough of their collaborator/pending-invite state to manage them
 * inline (#76) without a second round trip. */
export async function listBudgets(): Promise<BudgetSummary[]> {
  const user = await getCurrentUser();
  const budgets = await prisma.budget.findMany({
    where: { deleted: false, ...accessibleBudgetWhere(user.id) },
    orderBy: { createdAt: "asc" },
    include: {
      owner: { select: { email: true } },
      memberships: { include: { user: { select: { email: true } } } },
      invites: { select: { id: true, email: true }, orderBy: { createdAt: "asc" } },
    },
  });

  return budgets.map((b) => {
    const isOwner = b.ownerId === user.id;
    return {
      id: b.id,
      name: b.name,
      currency: b.currency,
      isOwner,
      ownerEmail: b.owner.email,
      collaborators: isOwner
        ? b.memberships.map((m) => ({ userId: m.userId, email: m.user.email }))
        : [],
      pendingInvites: isOwner
        ? b.invites.map((i) => ({ id: i.id, email: i.email }))
        : [],
    };
  });
}

/**
 * Marks a budget deleted and closes its accounts — the core of
 * deleteBudget's explicit, confirmed flow (src/app/budgets/actions.ts)
 * and of account deactivation's automatic one (src/app/auth/actions.ts,
 * ADR 0004): a Budget the deactivating owner holds outright, with no
 * Collaborators, is soft-deleted the same way, just without a
 * "type the name to confirm" step in front of it. Doesn't touch the
 * current-budget cookie or the Budget's pending Invites — callers handle
 * whichever of those apply to them.
 *
 * Writes the BUDGET "deleted" AuditEntry (#75/ADR 0002) itself, atomically
 * with the soft-delete, rather than leaving each caller to duplicate it —
 * `actorId` is the Owner in deleteBudget's explicit flow, or the
 * deactivating Owner themselves in account deactivation's automatic one.
 */
export async function softDeleteBudget(budgetId: string, actorId: string) {
  await prisma.$transaction((tx) =>
    auditedUpdate({
      tx,
      budgetId,
      entityType: "BUDGET",
      entityId: budgetId,
      actorId,
      action: "deleted",
      before: { deleted: false },
      after: { deleted: true },
      apply: async () => {
        await tx.budget.update({ where: { id: budgetId }, data: { deleted: true } });
        await tx.account.updateMany({
          where: { budgetId },
          data: { closed: true },
        });
      },
    }),
  );
}

/**
 * Per-category, per-month totals in milliunits: category id → Budget Month
 * (`YYYY-MM`) → amount. Built by getBudgetMonthRows from the month's
 * assignments and a per-month activity query, and passed in as plain
 * `Map`s so balanceFor/rowFor don't need to know Prisma's result shapes.
 */
export type MonthlyTotals = Map<string, Map<string, number>>;

export interface CategoryBalance {
  /** Available carried in from the month before: max(0, Available(M-1)). */
  carriedIn: number;
  available: number;
}

/**
 * A category's Available for a Budget Month, by ADR 0009's rollover rule:
 *
 *   Available(M) = max(0, Available(M-1)) + assigned(M) + activity(M)
 *
 * A positive balance carries forward; an overspent (negative) one resets to
 * 0 at the next month, where it comes out of Ready to Assign instead. The
 * fold only visits months that have an assignment or activity: a month with
 * neither just re-applies the max(0, ·), which changes nothing after the
 * first time.
 *
 * Kept pure and in this module, out of the page, so this — the
 * highest-consequence arithmetic in the app — is directly unit testable.
 */
export function balanceFor(
  categoryId: string,
  assignedByMonth: MonthlyTotals,
  activityByMonth: MonthlyTotals,
  month: Date,
): CategoryBalance {
  const target = formatBudgetMonth(month);
  const assigned = assignedByMonth.get(categoryId) ?? new Map<string, number>();
  const activity = activityByMonth.get(categoryId) ?? new Map<string, number>();
  // YYYY-MM keys sort chronologically as strings.
  const earlier = [...new Set([...assigned.keys(), ...activity.keys()])]
    .filter((key) => key < target)
    .sort();

  let available = 0;
  for (const key of earlier) {
    available = Math.max(0, available) + (assigned.get(key) ?? 0) + (activity.get(key) ?? 0);
  }
  const carriedIn = Math.max(0, available);
  return {
    carriedIn,
    available: carriedIn + (assigned.get(target) ?? 0) + (activity.get(target) ?? 0),
  };
}

/**
 * The bits of a category's *this month's* numbers rowFor needs, kept
 * independent of Prisma's `include` shape so callers (and tests) can pass
 * plain objects instead of a full Prisma category.
 */
export interface CategoryMonthActivity {
  id: string;
  name: string;
  /** This month's budgeted amount only — not the running total. */
  budgeted: number;
  /** This month's activity only (sum of this month's transaction amounts). */
  activity: number;
}

export interface CategoryRow extends CategoryMonthActivity, CategoryBalance {}

/**
 * One row of the budget table: this month's budgeted/activity alongside
 * the rolled-over Available and what was carried in (see balanceFor).
 */
export function rowFor(
  category: CategoryMonthActivity,
  assignedByMonth: MonthlyTotals,
  activityByMonth: MonthlyTotals,
  month: Date,
): CategoryRow {
  return {
    id: category.id,
    name: category.name,
    budgeted: category.budgeted,
    activity: category.activity,
    ...balanceFor(category.id, assignedByMonth, activityByMonth, month),
  };
}

function startOfNextMonth(month: Date): Date {
  return addMonths(month, 1);
}

export type CategoryOption = {
  id: string;
  name: string;
  categories: { id: string; name: string; available: number }[];
};

/** A category's Target state for the viewed month (ADR 0011). */
export interface CategoryTargetState {
  target: Target | null;
  need: TargetNeed | null;
  snoozed: boolean;
  status: TargetStatus;
}

export type BudgetCategoryRow = CategoryRow &
  CategoryTargetState & {
    /** Cash overspending to cover this month: how far Available is below
     * 0, else 0. The plan's total is `totals.overspending`. */
    overspending: number;
  };

export type BudgetMonthRows = {
  groups: {
    id: string;
    name: string;
    /** Whether the group has *no* categories at all — including hidden
     * ones, which are filtered out of `categories` for display but still
     * count (see CategoryGroupSection's own `isEmpty` doc comment). */
    isEmpty: boolean;
    categories: BudgetCategoryRow[];
  }[];
  categoryOptions: CategoryOption[];
  hiddenCategories: (BudgetCategoryRow & { groupName: string })[];
  /** Plan-level Underfunded, overspending and Cost to Be Me, over every
   * category, hidden ones included (ADR 0011). */
  totals: PlanTotals;
};

/** Works out a row's Target state from its stored target rows (at most the
 * latest on or before `month`), whether this month is snoozed, and its
 * assignments by month (a yearly Set aside counts this cycle's). */
function targetStateFor(
  row: CategoryRow,
  rows: TargetRow[],
  snoozed: boolean,
  assignedByMonth: Map<string, number> | undefined,
  month: Date,
): CategoryTargetState {
  const target = effectiveTarget(rows, month);
  const funding = { carriedIn: row.carriedIn, assigned: row.budgeted, snoozed, assignedByMonth };
  const need = target ? needFor(target, funding, month) : null;
  return {
    target,
    need,
    snoozed,
    status: targetStatus(target, need, { ...funding, available: row.available }),
  };
}

function addToMonthlyTotals(totals: MonthlyTotals, categoryId: string, monthKey: string, amount: number) {
  let months = totals.get(categoryId);
  if (!months) totals.set(categoryId, (months = new Map()));
  months.set(monthKey, (months.get(monthKey) ?? 0) + amount);
}

/**
 * Every month's assigned and activity totals before `nextMonth`, per
 * category. Activity is grouped by month in SQL (#135): Prisma's groupBy
 * can't group by a truncated date. Transaction dates are UTC wall-clock
 * times in a timestamp without time zone, so date_trunc gives the UTC
 * Budget Month. The upper bound is bound as a timestamp literal too: a JS
 * Date parameter arrives as timestamptz, and comparing it to the column
 * would depend on the database session's time zone.
 */
async function loadMonthlyTotals(categoryIds: string[], nextMonth: Date) {
  const assignedByMonth: MonthlyTotals = new Map();
  const activityByMonth: MonthlyTotals = new Map();
  if (categoryIds.length === 0) return { assignedByMonth, activityByMonth };

  const [assignments, activity] = await Promise.all([
    prisma.categoryMonth.findMany({
      where: { categoryId: { in: categoryIds }, month: { lt: nextMonth }, budgeted: { not: 0 } },
      select: { categoryId: true, month: true, budgeted: true },
    }),
    prisma.$queryRaw<{ categoryId: string; month: string; amount: bigint }[]>`
      SELECT "categoryId",
             to_char(date_trunc('month', "date"), 'YYYY-MM') AS "month",
             SUM("amount")::bigint AS "amount"
      FROM "Transaction"
      WHERE "categoryId" IN (${Prisma.join(categoryIds)}) AND "date" < ${`${formatBudgetMonth(nextMonth)}-01`}::timestamp
      GROUP BY 1, 2
    `,
  ]);

  for (const row of assignments) {
    addToMonthlyTotals(assignedByMonth, row.categoryId, formatBudgetMonth(row.month), row.budgeted);
  }
  for (const row of activity) {
    addToMonthlyTotals(activityByMonth, row.categoryId, row.month, Number(row.amount));
  }
  return { assignedByMonth, activityByMonth };
}

/**
 * The budget page's full month view for one budget: every category group
 * (with its non-hidden categories rendered as rows), the slimmed-down
 * per-group category list the "move money to…" popover uses, and every
 * hidden category collected into its own synthetic section. Gathers the
 * per-month totals balanceFor/rowFor need (#98, ADR 0009) —
 * `month` must be a Budget Month, the UTC 1st (src/lib/budgetMonth.ts).
 */
export async function getBudgetMonthRows(
  budgetId: string,
  month: Date,
): Promise<BudgetMonthRows> {
  const nextMonth = startOfNextMonth(month);

  const groups = await prisma.categoryGroup.findMany({
    where: { budgetId },
    orderBy: { sortOrder: "asc" },
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          months: { where: { month } },
          transactions: {
            where: { date: { gte: month, lt: nextMonth } },
            select: { amount: true },
          },
          // ADR 0011: only the latest row on or before this month applies.
          targets: { where: { startMonth: { lte: month } }, orderBy: { startMonth: "desc" }, take: 1 },
          targetSnoozes: { where: { month }, select: { id: true } },
        },
      },
    },
  });

  const categoryIds = groups.flatMap((g) => g.categories.map((c) => c.id));

  // Available rolls over month by month (ADR 0009, see balanceFor), so it
  // needs every earlier month's assigned and activity per category.
  const { assignedByMonth, activityByMonth } = await loadMonthlyTotals(categoryIds, nextMonth);

  function categoryRow(category: (typeof groups)[number]["categories"][number]): BudgetCategoryRow {
    const row = rowFor(
      {
        id: category.id,
        name: category.name,
        budgeted: category.months[0]?.budgeted ?? 0,
        activity: category.transactions.reduce((sum, t) => sum + t.amount, 0),
      },
      assignedByMonth,
      activityByMonth,
      month,
    );
    const snoozed = category.targetSnoozes.length > 0;
    return {
      ...row,
      ...targetStateFor(row, category.targets, snoozed, assignedByMonth.get(category.id), month),
      overspending: Math.max(0, -row.available),
    };
  }

  // Slimmed-down category list (just id/name/available) for the "move
  // money to…" popover on each Available cell. Includes hidden categories
  // too — they still have money in them, and still need somewhere to move
  // it to/from.
  const categoryOptions = groups.map((group) => ({
    id: group.id,
    name: group.name,
    categories: group.categories.map((c) => ({
      id: c.id,
      name: c.name,
      available: balanceFor(c.id, assignedByMonth, activityByMonth, month).available,
    })),
  }));

  // Hiding is presentational only — a hidden category keeps its real
  // categoryGroupId/sortOrder (see the `hidden` field's doc comment in
  // schema.prisma) — so it's filtered out of its real group's rendered
  // rows here and collected into one synthetic "Hidden" section instead,
  // appended after every real group. That section only renders at all
  // when it's non-empty.
  const hiddenCategories = groups.flatMap((group) =>
    group.categories
      .filter((c) => c.hidden)
      .map((category) => ({ ...categoryRow(category), groupName: group.name })),
  );

  const visibleGroups = groups.map((group) => ({
    id: group.id,
    name: group.name,
    isEmpty: group.categories.length === 0,
    categories: group.categories.filter((c) => !c.hidden).map(categoryRow),
  }));
  const visibleRows = visibleGroups.flatMap((group) => group.categories);

  return {
    groups: visibleGroups,
    categoryOptions,
    hiddenCategories,
    totals: planTotals([...visibleRows, ...hiddenCategories]),
  };
}

/**
 * The months a budget can be navigated to (#124), from its creation date
 * and three aggregates: the earliest transaction, the earliest assignment
 * row and the latest month with money assigned.
 */
export async function getBudgetMonthRange(
  budgetId: string,
  now: Date = new Date(),
): Promise<BudgetMonthRange> {
  const inBudget = { category: { categoryGroup: { budgetId } } };
  const [budget, transactions, firstAssignment, lastAssignment] = await Promise.all([
    prisma.budget.findUniqueOrThrow({ where: { id: budgetId }, select: { createdAt: true } }),
    prisma.transaction.aggregate({ where: { account: { budgetId } }, _min: { date: true } }),
    prisma.categoryMonth.aggregate({ where: inBudget, _min: { month: true } }),
    prisma.categoryMonth.aggregate({
      where: { ...inBudget, budgeted: { not: 0 } },
      _max: { month: true },
    }),
  ]);
  return navigableRange(
    {
      budgetCreatedAt: budget.createdAt,
      earliestTransaction: transactions._min.date,
      earliestAssignment: firstAssignment._min.month,
      latestAssignment: lastAssignment._max.month,
    },
    currentBudgetMonth(now),
  );
}

/**
 * Validates the `YYYY-MM` month a budget-page form sends (#124) into its
 * UTC first-of-month, rejecting a malformed month or one outside the
 * budget's navigable range.
 */
export async function requireNavigableMonth(budgetId: string, input: string): Promise<Date> {
  const month = parseBudgetMonth(input);
  if (!month) {
    throw new Error("month must be YYYY-MM");
  }
  if (!isInRange(month, await getBudgetMonthRange(budgetId))) {
    throw new Error("month is outside this budget's range");
  }
  return month;
}

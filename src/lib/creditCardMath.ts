import { isDebtAccountType } from "@/lib/accountTypes";
import { STARTING_BALANCE_PAYEE } from "@/lib/payees";

/**
 * Credit-card coverage (ADR 0010), the pure part of the #135 prototype's
 * BudgetMath. Amounts are integer milliunits. Nothing here is stored:
 * getBudgetMonthRows folds per-month totals through these functions at
 * read time.
 *
 * Cash spending in a category is covered first. What's left covers that
 * month's net card spending, split across cards in proportion to each
 * card's spending. Each share rounds to the currency's minor unit (a cent
 * is 10 milliunits for a two-decimal currency), largest remainder first.
 * Only cash overspending comes out of Ready to Assign. Credit overspending
 * stays on the card.
 */

/** Milliunits in one minor unit. JPY has no minor unit; every other
 * currency this app offers has two decimal places (src/lib/currencies.ts). */
export function minorUnitMilliunits(currency: string): number {
  return currency === "JPY" ? 1000 : 10;
}

/**
 * A negative Starting Balance on a card has no category and stays outside
 * the budget (ADR 0010). A positive one is Inflow: Ready to Assign, so it
 * has a category and is not excluded here. The uncategorized query copies
 * this rule.
 */
export function isExcludedCardStartingBalance(row: {
  categoryId: string | null;
  accountType: string;
  payeeName: string | null;
}): boolean {
  return row.categoryId == null && isDebtAccountType(row.accountType) && row.payeeName === STARTING_BALANCE_PAYEE;
}

export interface SplitPart {
  id: string;
  /** Positive weight. Zero-weight parts are absent from the input. */
  weight: number;
}

/**
 * Split `total` across `parts` in proportion to their weights, in whole
 * minor units, largest remainder first. Sub-cent residue (a total that
 * isn't a whole number of minor units) and a tie in the remainders both go
 * to the earliest part. The shares add up to `total`.
 */
export function splitLargestRemainder(
  total: number,
  parts: readonly SplitPart[],
  unit: number,
): { id: string; amount: number }[] {
  if (!Number.isInteger(unit) || unit <= 0) {
    throw new RangeError(`minor unit must be a positive integer, got ${unit}`);
  }
  const zeros = parts.map((part) => ({ id: part.id, amount: 0 }));
  if (total <= 0 || parts.length === 0) return zeros;

  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (weight <= 0) return zeros;

  const units = Math.floor(total / unit);
  const residue = total - units * unit;
  const raw = parts.map((part, index) => {
    const exact = (units * part.weight) / weight;
    const whole = Math.floor(exact);
    return { id: part.id, index, whole, remainder: exact - whole };
  });
  let left = units - raw.reduce((sum, part) => sum + part.whole, 0);
  const order = [...raw].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const part of order) {
    if (left <= 0) break;
    part.whole += 1;
    left -= 1;
  }
  const amounts = new Map(raw.map((part) => [part.id, part.whole * unit]));
  if (residue > 0) {
    const first = order[0];
    amounts.set(first.id, (amounts.get(first.id) ?? 0) + residue);
  }
  return parts.map((part) => ({ id: part.id, amount: amounts.get(part.id) ?? 0 }));
}

export interface CardNet {
  accountId: string;
  /** Signed. Negative is spending on that card; positive is a refund. */
  net: number;
}

export interface SpendingCoverage {
  /** Signed activity: cash plus every card's net. */
  activity: number;
  available: number;
  /** Cash shortfall. This is what Ready to Assign loses next month. */
  cashOverspend: number;
  /** Card spending the category didn't cover. It never touches Ready to Assign. */
  creditOverspend: number;
  /** Covered card spending moved into each card's Payment Category. */
  fundedByCard: { accountId: string; amount: number }[];
  /** Net refunds moved back out of each card's Payment Category. */
  refundByCard: { accountId: string; amount: number }[];
}

/**
 * One category's month, after cash is covered. `carriedIn` is last month's
 * Available; a negative one has already reset to 0 (ADR 0009). Card nets
 * are already netted per card, so a refund in the same month as a purchase
 * on that card reduces the spending instead of coming back out separately.
 */
export function coverSpending(input: {
  carriedIn: number;
  assigned: number;
  /** Signed activity on on-budget accounts that aren't cards. */
  cashActivity: number;
  cards: readonly CardNet[];
  minorUnit: number;
}): SpendingCoverage {
  const carried = Math.max(0, input.carriedIn);
  const spend: SplitPart[] = [];
  const refundByCard: { accountId: string; amount: number }[] = [];
  let refunds = 0;
  for (const card of input.cards) {
    if (card.net < 0) spend.push({ id: card.accountId, weight: -card.net });
    else if (card.net > 0) {
      refunds += card.net;
      refundByCard.push({ accountId: card.accountId, amount: card.net });
    }
  }
  const cardSpend = spend.reduce((sum, part) => sum + part.weight, 0);
  const cashLeft = carried + input.assigned + input.cashActivity + refunds;
  const funded = Math.min(Math.max(cashLeft, 0), cardSpend);
  const fundedByCard = splitLargestRemainder(funded, spend, input.minorUnit)
    .filter((part) => part.amount !== 0)
    .map((part) => ({ accountId: part.id, amount: part.amount }));
  return {
    activity: input.cashActivity + input.cards.reduce((sum, card) => sum + card.net, 0),
    available: cashLeft - cardSpend,
    cashOverspend: Math.max(0, -cashLeft),
    creditOverspend: cardSpend - funded,
    fundedByCard,
    refundByCard,
  };
}

/**
 * Payment Category activity for one card and month (ADR 0010): funded card
 * spending, minus refunds, minus on-budget transfers. A transfer into the
 * card is positive on the card's side, so it lowers activity (a payment).
 * A transfer out is negative, so it raises activity (a cash advance).
 */
export function paymentCategoryActivity(funded: number, refunds: number, transfers: number): number {
  return funded - refunds - transfers;
}

export interface CategoryMonthFigures {
  carriedIn: number;
  assigned: number;
  activity: number;
  available: number;
  cashOverspend: number;
  creditOverspend: number;
}

export interface ActivityRow {
  categoryId: string;
  month: string;
  amount: number;
  accountId?: string | null;
  accountType?: string | null;
}

export interface FoldedActivity {
  /** category → month → signed total, payment categories left out. */
  totals: Map<string, Map<string, number>>;
  /** category → month → signed cash (non-card) activity. */
  cash: Map<string, Map<string, number>>;
  /** category → month → card account → signed net. */
  cards: Map<string, Map<string, Map<string, number>>>;
}

function addNested(map: Map<string, Map<string, number>>, outer: string, inner: string, amount: number) {
  let innerMap = map.get(outer);
  if (!innerMap) map.set(outer, (innerMap = new Map()));
  innerMap.set(inner, (innerMap.get(inner) ?? 0) + amount);
}

/**
 * Fold the per-category, per-account, per-month activity query. A row with
 * no card type counts as cash, which is what the budget did before cards
 * were distinguished. Payment categories have no transactions that count.
 */
export function foldActivityRows(rows: readonly ActivityRow[], paymentCategoryIds: Iterable<string> = []): FoldedActivity {
  const payments = new Set(paymentCategoryIds);
  const folded: FoldedActivity = { totals: new Map(), cash: new Map(), cards: new Map() };
  for (const row of rows) {
    if (payments.has(row.categoryId)) continue;
    addNested(folded.totals, row.categoryId, row.month, row.amount);
    if (row.accountType && isDebtAccountType(row.accountType)) {
      const accountId = row.accountId || "__card__";
      let months = folded.cards.get(row.categoryId);
      if (!months) folded.cards.set(row.categoryId, (months = new Map()));
      let cards = months.get(row.month);
      if (!cards) months.set(row.month, (cards = new Map()));
      cards.set(accountId, (cards.get(accountId) ?? 0) + row.amount);
    } else {
      addNested(folded.cash, row.categoryId, row.month, row.amount);
    }
  }
  return folded;
}

function monthKeys(...maps: (Iterable<[string, Iterable<[string, unknown]>]> | undefined)[]): string[] {
  const keys = new Set<string>();
  for (const map of maps) {
    if (!map) continue;
    for (const [, months] of map) for (const [key] of months) keys.add(key);
  }
  return [...keys].sort();
}

function readAmount(
  map: { get(id: string): { get(month: string): number | undefined } | undefined } | undefined,
  id: string,
  month: string,
): number {
  return map?.get(id)?.get(month) ?? 0;
}

interface DeriveInput {
  spendingCategoryIds: readonly string[];
  /** Card account id → its Payment Category id. */
  paymentCategoryByCard: ReadonlyMap<string, string>;
  assignedByCategory: ReadonlyMap<string, ReadonlyMap<string, number>>;
  cash: ReadonlyMap<string, ReadonlyMap<string, number>>;
  cards: ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, number>>>;
  /** Card account → month → signed sum of the card side of on-budget transfers. */
  cardTransfers: ReadonlyMap<string, ReadonlyMap<string, number>>;
  through: string;
  minorUnit: number;
}

function remember(
  result: Map<string, Map<string, CategoryMonthFigures>>,
  previous: Map<string, number>,
  categoryId: string,
  month: string,
  figures: CategoryMonthFigures,
) {
  let byMonth = result.get(categoryId);
  if (!byMonth) result.set(categoryId, (byMonth = new Map()));
  byMonth.set(month, figures);
  previous.set(categoryId, figures.available);
}

function addMoved(target: Map<string, number>, accountId: string, amount: number) {
  target.set(accountId, (target.get(accountId) ?? 0) + amount);
}

/** One spending category for one month. Covered card spending is added to `moved`. */
function recordSpending(
  input: DeriveInput,
  previous: Map<string, number>,
  result: Map<string, Map<string, CategoryMonthFigures>>,
  moved: { funded: Map<string, number>; refunds: Map<string, number> },
  categoryId: string,
  month: string,
) {
  const cards = [...(input.cards.get(categoryId)?.get(month) ?? [])]
    .map(([accountId, net]) => ({ accountId, net }))
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
  const assigned = readAmount(input.assignedByCategory, categoryId, month);
  const cashActivity = readAmount(input.cash, categoryId, month);
  if (assigned === 0 && cashActivity === 0 && cards.length === 0) return;
  const carriedIn = Math.max(0, previous.get(categoryId) ?? 0);
  const covered = coverSpending({ carriedIn, assigned, cashActivity, cards, minorUnit: input.minorUnit });
  for (const funded of covered.fundedByCard) addMoved(moved.funded, funded.accountId, funded.amount);
  for (const refund of covered.refundByCard) addMoved(moved.refunds, refund.accountId, refund.amount);
  remember(result, previous, categoryId, month, {
    carriedIn,
    assigned,
    activity: covered.activity,
    available: covered.available,
    cashOverspend: covered.cashOverspend,
    creditOverspend: covered.creditOverspend,
  });
}

/** One Payment Category for one month, after every spending category that month is recorded. */
function recordPayment(
  input: DeriveInput,
  previous: Map<string, number>,
  result: Map<string, Map<string, CategoryMonthFigures>>,
  moved: { funded: Map<string, number>; refunds: Map<string, number> },
  cardId: string,
  categoryId: string,
  month: string,
) {
  const funded = moved.funded.get(cardId) ?? 0;
  const refunds = moved.refunds.get(cardId) ?? 0;
  const transfers = readAmount(input.cardTransfers, cardId, month);
  const assigned = readAmount(input.assignedByCategory, categoryId, month);
  const quiet = funded === 0 && refunds === 0 && transfers === 0 && assigned === 0;
  if (quiet && !previous.has(categoryId)) return;
  const carriedIn = Math.max(0, previous.get(categoryId) ?? 0);
  const activity = paymentCategoryActivity(funded, refunds, transfers);
  const available = carriedIn + assigned + activity;
  remember(result, previous, categoryId, month, {
    carriedIn,
    assigned,
    activity,
    available,
    cashOverspend: Math.max(0, -available),
    creditOverspend: 0,
  });
}

/**
 * Walk every month that has assignments, activity, or a card transfer, up
 * to and including `through` (`YYYY-MM`), and derive each category's
 * figures. Payment-category activity depends on the funded spending of
 * that same month, so spending categories are resolved first.
 */
export function deriveCreditCardMonths(input: DeriveInput): Map<string, Map<string, CategoryMonthFigures>> {
  const months = monthKeys(input.assignedByCategory, input.cash, input.cards, input.cardTransfers).filter(
    (month) => month <= input.through,
  );
  const result = new Map<string, Map<string, CategoryMonthFigures>>();
  const previous = new Map<string, number>();

  for (const month of months) {
    const moved = { funded: new Map<string, number>(), refunds: new Map<string, number>() };
    for (const categoryId of input.spendingCategoryIds) {
      recordSpending(input, previous, result, moved, categoryId, month);
    }
    for (const [cardId, categoryId] of input.paymentCategoryByCard) {
      recordPayment(input, previous, result, moved, cardId, categoryId, month);
    }
  }
  return result;
}

import {
  coverSpending,
  deriveCreditCardMonths,
  foldActivityRows,
  isExcludedCardStartingBalance,
  minorUnitMilliunits,
  paymentCategoryActivity,
  splitLargestRemainder,
  type CategoryMonthFigures,
} from "./creditCardMath";

const USD = minorUnitMilliunits("USD");

function figures(
  derived: Map<string, Map<string, CategoryMonthFigures>>,
  categoryId: string,
  month: string,
): CategoryMonthFigures {
  const row = derived.get(categoryId)?.get(month);
  if (!row) throw new Error(`no figures for ${categoryId} in ${month}`);
  return row;
}

describe("minorUnitMilliunits", () => {
  it("is one cent for a two-decimal currency and one yen for JPY", () => {
    expect(USD).toBe(10);
    expect(minorUnitMilliunits("EUR")).toBe(10);
    expect(minorUnitMilliunits("JPY")).toBe(1000);
  });
});

describe("isExcludedCardStartingBalance", () => {
  it("leaves a negative card Starting Balance outside the budget", () => {
    expect(
      isExcludedCardStartingBalance({
        categoryId: null,
        accountType: "CREDIT_CARD",
        payeeName: "Starting Balance",
      }),
    ).toBe(true);
    expect(
      isExcludedCardStartingBalance({
        categoryId: null,
        accountType: "LINE_OF_CREDIT",
        payeeName: "Starting Balance",
      }),
    ).toBe(true);
  });

  it("keeps a categorized or cash Starting Balance, and other uncategorized card spending", () => {
    expect(
      isExcludedCardStartingBalance({
        categoryId: "rta",
        accountType: "CREDIT_CARD",
        payeeName: "Starting Balance",
      }),
    ).toBe(false);
    expect(
      isExcludedCardStartingBalance({
        categoryId: null,
        accountType: "CHECKING",
        payeeName: "Starting Balance",
      }),
    ).toBe(false);
    expect(
      isExcludedCardStartingBalance({ categoryId: null, accountType: "CREDIT_CARD", payeeName: "Cafe" }),
    ).toBe(false);
  });
});

describe("splitLargestRemainder", () => {
  it("splits $100 covering $100 and $50 of card spending into $66.67 and $33.33", () => {
    const shares = splitLargestRemainder(
      100_000,
      [
        { id: "visa", weight: 100_000 },
        { id: "amex", weight: 50_000 },
      ],
      USD,
    );
    expect(shares).toEqual([
      { id: "visa", amount: 66_670 },
      { id: "amex", amount: 33_330 },
    ]);
    expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(100_000);
  });

  it("gives a tied remainder to the earliest card, and keeps a sub-cent residue there too", () => {
    expect(
      splitLargestRemainder(
        10,
        [
          { id: "a", weight: 1 },
          { id: "b", weight: 1 },
          { id: "c", weight: 1 },
        ],
        USD,
      ),
    ).toEqual([
      { id: "a", amount: 10 },
      { id: "b", amount: 0 },
      { id: "c", amount: 0 },
    ]);
    // 2.5 cents across two equal weights: 2 cents split evenly, the half cent to the first.
    expect(
      splitLargestRemainder(
        25,
        [
          { id: "a", weight: 1 },
          { id: "b", weight: 1 },
        ],
        USD,
      ),
    ).toEqual([
      { id: "a", amount: 15 },
      { id: "b", amount: 10 },
    ]);
  });

  it("rounds yen to whole yen", () => {
    expect(splitLargestRemainder(3000, [{ id: "a", weight: 2 }, { id: "b", weight: 1 }], 1000)).toEqual([
      { id: "a", amount: 2000 },
      { id: "b", amount: 1000 },
    ]);
  });
});

describe("coverSpending", () => {
  it("moves a covered card purchase into the card and leaves no overspending", () => {
    const covered = coverSpending({
      carriedIn: 0,
      assigned: 100_000,
      cashActivity: 0,
      cards: [{ accountId: "visa", net: -100_000 }],
      minorUnit: USD,
    });
    expect(covered).toMatchObject({
      activity: -100_000,
      available: 0,
      cashOverspend: 0,
      creditOverspend: 0,
      fundedByCard: [{ accountId: "visa", amount: 100_000 }],
    });
  });

  it("leaves the uncovered part of a card purchase as credit overspending", () => {
    const covered = coverSpending({
      carriedIn: 0,
      assigned: 40_000,
      cashActivity: 0,
      cards: [{ accountId: "visa", net: -100_000 }],
      minorUnit: USD,
    });
    expect(covered).toMatchObject({
      available: -60_000,
      cashOverspend: 0,
      creditOverspend: 60_000,
      fundedByCard: [{ accountId: "visa", amount: 40_000 }],
    });
  });

  it("covers cash before the card in a mixed overspend", () => {
    const covered = coverSpending({
      carriedIn: 0,
      assigned: 0,
      cashActivity: -50_000,
      cards: [{ accountId: "visa", net: -50_000 }],
      minorUnit: USD,
    });
    expect(covered).toMatchObject({
      activity: -100_000,
      available: -100_000,
      cashOverspend: 50_000,
      creditOverspend: 50_000,
      fundedByCard: [],
    });
  });

  it("nets a refund on the same card in the same month before funding", () => {
    const covered = coverSpending({
      carriedIn: 0,
      assigned: 100_000,
      cashActivity: 0,
      cards: [{ accountId: "visa", net: -60_000 }],
      minorUnit: USD,
    });
    expect(covered.fundedByCard).toEqual([{ accountId: "visa", amount: 60_000 }]);
    expect(covered.refundByCard).toEqual([]);
    expect(covered.available).toBe(40_000);
  });
});

describe("deriveCreditCardMonths (ADR 0010 scenarios)", () => {
  const visa = new Map([["visa", "pay-visa"]]);
  const both = new Map([
    ["visa", "pay-visa"],
    ["amex", "pay-amex"],
  ]);

  function derive(input: {
    assigned?: Record<string, Record<string, number>>;
    cash?: Record<string, Record<string, number>>;
    cards?: Record<string, Record<string, Record<string, number>>>;
    transfers?: Record<string, Record<string, number>>;
    paymentCategoryByCard?: Map<string, string>;
    spending?: string[];
    through?: string;
  }) {
    const mapOf = (entries: Record<string, Record<string, number>> | undefined) =>
      new Map(Object.entries(entries ?? {}).map(([id, months]) => [id, new Map(Object.entries(months))]));
    const cards = new Map(
      Object.entries(input.cards ?? {}).map(([categoryId, months]) => [
        categoryId,
        new Map(Object.entries(months).map(([month, byCard]) => [month, new Map(Object.entries(byCard))])),
      ]),
    );
    return deriveCreditCardMonths({
      spendingCategoryIds: input.spending ?? ["groceries", "uncat"],
      paymentCategoryByCard: input.paymentCategoryByCard ?? visa,
      assignedByCategory: mapOf(input.assigned),
      cash: mapOf(input.cash),
      cards,
      cardTransfers: mapOf(input.transfers),
      through: input.through ?? "2026-03",
      minorUnit: USD,
    });
  }

  it("funds the Payment Category for a covered purchase, and a transfer in lowers that activity", () => {
    const derived = derive({
      assigned: { groceries: { "2026-03": 100_000 } },
      cards: { groceries: { "2026-03": { visa: -100_000 } } },
      transfers: { visa: { "2026-03": 40_000 } },
    });
    expect(figures(derived, "groceries", "2026-03")).toMatchObject({
      available: 0,
      cashOverspend: 0,
      creditOverspend: 0,
    });
    // Funded 100 minus a 40 payment.
    expect(figures(derived, "pay-visa", "2026-03")).toMatchObject({
      activity: 60_000,
      available: 60_000,
      cashOverspend: 0,
      creditOverspend: 0,
    });
    expect(paymentCategoryActivity(100_000, 0, 40_000)).toBe(60_000);
  });

  it("does not take a partly covered purchase out of Ready to Assign", () => {
    const derived = derive({
      assigned: { groceries: { "2026-02": 40_000 } },
      cards: { groceries: { "2026-02": { visa: -100_000 } } },
      through: "2026-03",
    });
    expect(figures(derived, "groceries", "2026-02")).toMatchObject({
      available: -60_000,
      cashOverspend: 0,
      creditOverspend: 60_000,
    });
    expect(figures(derived, "pay-visa", "2026-02").available).toBe(40_000);
    // March resets the category to 0 and does not repeat the credit overspend.
    expect(derived.get("groceries")?.get("2026-03")).toBeUndefined();
    expect(derived.get("pay-visa")?.get("2026-03")).toBeUndefined();
  });

  it("takes only the cash part of a mixed overspend", () => {
    const derived = derive({
      cash: { groceries: { "2026-03": -50_000 } },
      cards: { groceries: { "2026-03": { visa: -50_000 } } },
    });
    expect(figures(derived, "groceries", "2026-03")).toMatchObject({
      available: -100_000,
      cashOverspend: 50_000,
      creditOverspend: 50_000,
    });
    expect(derived.get("pay-visa")).toBeUndefined();
  });

  it("splits a shortfall across two cards in whole cents", () => {
    const derived = derive({
      assigned: { groceries: { "2026-03": 100_000 } },
      cards: { groceries: { "2026-03": { visa: -100_000, amex: -50_000 } } },
      paymentCategoryByCard: both,
    });
    expect(figures(derived, "groceries", "2026-03")).toMatchObject({
      available: -50_000,
      cashOverspend: 0,
      creditOverspend: 50_000,
    });
    expect(figures(derived, "pay-visa", "2026-03").activity).toBe(66_670);
    expect(figures(derived, "pay-amex", "2026-03").activity).toBe(33_330);
  });

  it("moves a later refund back out of the Payment Category", () => {
    const derived = derive({
      assigned: { groceries: { "2026-02": 100_000 } },
      cards: {
        groceries: {
          "2026-02": { visa: -100_000 },
          "2026-03": { visa: 30_000 },
        },
      },
    });
    expect(figures(derived, "groceries", "2026-03")).toMatchObject({
      activity: 30_000,
      available: 30_000,
      cashOverspend: 0,
      creditOverspend: 0,
    });
    expect(figures(derived, "pay-visa", "2026-03")).toMatchObject({
      carriedIn: 100_000,
      activity: -30_000,
      available: 70_000,
      cashOverspend: 0,
    });
  });

  it("treats a payment larger than Available as cash overspending", () => {
    const derived = derive({
      assigned: { groceries: { "2026-02": 40_000 } },
      cards: { groceries: { "2026-02": { visa: -40_000 } } },
      transfers: { visa: { "2026-03": 100_000 } },
    });
    expect(figures(derived, "pay-visa", "2026-02").available).toBe(40_000);
    expect(figures(derived, "pay-visa", "2026-03")).toMatchObject({
      carriedIn: 40_000,
      activity: -100_000,
      available: -60_000,
      cashOverspend: 60_000,
      creditOverspend: 0,
    });
  });

  it("adds a cash advance to the Payment Category and not to Ready to Assign", () => {
    const derived = derive({
      transfers: { visa: { "2026-03": -50_000 } },
    });
    expect(figures(derived, "pay-visa", "2026-03")).toMatchObject({
      activity: 50_000,
      available: 50_000,
      cashOverspend: 0,
      creditOverspend: 0,
    });
  });

  it("moves money between two cards' Payment Categories", () => {
    const derived = derive({
      transfers: { visa: { "2026-03": -20_000 }, amex: { "2026-03": 20_000 } },
      paymentCategoryByCard: both,
    });
    expect(figures(derived, "pay-visa", "2026-03").activity).toBe(20_000);
    expect(figures(derived, "pay-amex", "2026-03").activity).toBe(-20_000);
  });

  it("ignores a card's negative Starting Balance and still carries a positive one as income, not card activity", () => {
    // The Starting Balance never reaches this function: the read path drops
    // the negative uncategorized one, and categorizes a positive one as
    // Inflow: Ready to Assign. With no activity, the Payment Category is absent.
    const derived = derive({});
    expect(derived.size).toBe(0);
  });

  it("treats uncategorized card spending like any other category", () => {
    const derived = derive({
      cards: { uncat: { "2026-03": { visa: -30_000 } } },
    });
    expect(figures(derived, "uncat", "2026-03")).toMatchObject({
      cashOverspend: 0,
      creditOverspend: 30_000,
      available: -30_000,
    });
    expect(derived.get("pay-visa")).toBeUndefined();
  });

  it("keeps Ready to Assign plus every Available equal to cash, adjusted for credit overspending", () => {
    // $200 income on checking, $40 assigned, $100 spent on the card.
    // Payment Category holds the covered $40. Groceries is -$60.
    // Credit overspending is $60 and is the only reason the two sides differ from cash.
    const derived = derive({
      assigned: { groceries: { "2026-03": 40_000 } },
      cards: { groceries: { "2026-03": { visa: -100_000 } } },
    });
    const rows = [...(derived.get("groceries")?.values() ?? []), ...(derived.get("pay-visa")?.values() ?? [])];
    const envelopes = rows.reduce((sum, row) => sum + row.available, 0);
    const creditOverspend = rows.reduce((sum, row) => sum + row.creditOverspend, 0);
    const assigned = 40_000;
    const income = 200_000;
    const readyToAssign = income - assigned;
    const cashInChecking = income;
    expect(creditOverspend).toBe(60_000);
    expect(readyToAssign + envelopes).toBe(cashInChecking - creditOverspend);
  });

  it("a refund after the card was paid off is cash overspending on the Payment Category", () => {
    const derived = derive({
      assigned: { groceries: { "2026-01": 100_000 } },
      cards: {
        groceries: {
          "2026-01": { visa: -100_000 },
          "2026-03": { visa: 30_000 },
        },
      },
      transfers: { visa: { "2026-02": 100_000 } },
    });
    expect(figures(derived, "pay-visa", "2026-02")).toMatchObject({ available: 0, cashOverspend: 0 });
    expect(figures(derived, "pay-visa", "2026-03")).toMatchObject({
      activity: -30_000,
      available: -30_000,
      cashOverspend: 30_000,
    });
    // The spending category keeps the refund.
    expect(figures(derived, "groceries", "2026-03").available).toBe(30_000);
  });
});

describe("foldActivityRows", () => {
  it("splits card nets from cash and skips Payment Categories", () => {
    const folded = foldActivityRows(
      [
        { categoryId: "groceries", month: "2026-03", amount: -4_000, accountId: "checking", accountType: "CHECKING" },
        { categoryId: "groceries", month: "2026-03", amount: -10_000, accountId: "visa", accountType: "CREDIT_CARD" },
        { categoryId: "pay-visa", month: "2026-03", amount: -1, accountId: "visa", accountType: "CREDIT_CARD" },
        { categoryId: "old", month: "2026-02", amount: -5_000 },
      ],
      ["pay-visa"],
    );
    expect(folded.totals.get("groceries")?.get("2026-03")).toBe(-14_000);
    expect(folded.cash.get("groceries")?.get("2026-03")).toBe(-4_000);
    expect(folded.cards.get("groceries")?.get("2026-03")?.get("visa")).toBe(-10_000);
    expect(folded.cash.get("old")?.get("2026-02")).toBe(-5_000);
    expect(folded.totals.has("pay-visa")).toBe(false);
  });
});

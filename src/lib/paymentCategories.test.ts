import { auditedCreate } from "./audit";
import {
  CREDIT_CARD_PAYMENTS_GROUP,
  PAYMENT_CATEGORY_IN_USE,
  accountQualifiesForPaymentCategory,
  ensurePaymentCategory,
  startingBalanceCategoryId,
  syncPaymentCategory,
} from "./paymentCategories";

jest.mock("./audit", () => ({
  auditedCreate: jest.fn(async (p: { apply: () => Promise<unknown> }) => p.apply()),
  auditedUpdate: jest.fn(async (p: { apply: () => Promise<unknown> }) => p.apply()),
  auditedDelete: jest.fn(async (p: { apply: () => Promise<unknown> }) => p.apply()),
}));

function account(over: Partial<{ name: string; type: "CREDIT_CARD" | "CHECKING"; onBudget: boolean; closed: boolean }> = {}) {
  return { name: "Visa", type: "CREDIT_CARD" as const, onBudget: true, closed: false, ...over };
}

describe("startingBalanceCategoryId", () => {
  it("leaves a negative card balance uncategorized and categorizes everything else as Ready to Assign", () => {
    expect(startingBalanceCategoryId("CREDIT_CARD", -50_000, "rta")).toBeNull();
    expect(startingBalanceCategoryId("LINE_OF_CREDIT", -1, "rta")).toBeNull();
    expect(startingBalanceCategoryId("CREDIT_CARD", 0, "rta")).toBe("rta");
    expect(startingBalanceCategoryId("CREDIT_CARD", 20_000, "rta")).toBe("rta");
    expect(startingBalanceCategoryId("CHECKING", -20_000, "rta")).toBe("rta");
  });
});

describe("accountQualifiesForPaymentCategory", () => {
  it("is an on-budget card or line of credit only", () => {
    expect(accountQualifiesForPaymentCategory("CREDIT_CARD", true)).toBe(true);
    expect(accountQualifiesForPaymentCategory("LINE_OF_CREDIT", true)).toBe(true);
    expect(accountQualifiesForPaymentCategory("CREDIT_CARD", false)).toBe(false);
    expect(accountQualifiesForPaymentCategory("CHECKING", true)).toBe(false);
  });
});

describe("ensurePaymentCategory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates the system group and one category named for the account, auditing both", async () => {
    const tx = {
      category: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "pay-1", ...data })),
      },
      categoryGroup: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ sortOrder: 2 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "group-cc", ...data })),
      },
    };

    const created = await ensurePaymentCategory(tx as never, {
      budgetId: "budget-1",
      actorId: "user-1",
      account: { id: "visa", name: "Visa", closed: false },
    });

    expect(created).toMatchObject({
      name: "Visa",
      paymentForAccountId: "visa",
      hidden: false,
      categoryGroupId: "group-cc",
    });
    expect(tx.categoryGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: CREDIT_CARD_PAYMENTS_GROUP,
        systemKind: "CREDIT_CARD_PAYMENTS",
        sortOrder: 3,
      }),
    });
    expect(auditedCreate).toHaveBeenCalledTimes(2);
  });

  it("returns the category the account already has", async () => {
    const existing = { id: "pay-1", name: "Visa" };
    const tx = { category: { findUnique: jest.fn().mockResolvedValue(existing) } };
    await expect(
      ensurePaymentCategory(tx as never, {
        budgetId: "budget-1",
        actorId: "user-1",
        account: { id: "visa", name: "Visa", closed: false },
      }),
    ).resolves.toBe(existing);
  });
});

describe("syncPaymentCategory", () => {
  it("renames the category with the account and hides it when the account closes", async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      category: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pay-1",
          name: "Visa",
          hidden: false,
          categoryGroupId: "group-cc",
          paymentForAccountId: "visa",
        }),
        update,
      },
    };

    await syncPaymentCategory(tx as never, {
      budgetId: "budget-1",
      actorId: "user-1",
      accountId: "visa",
      before: account(),
      after: account({ name: "Travel Visa", closed: true }),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { name: "Travel Visa", hidden: true },
    });
  });

  it("removes the category when the account stops being a card and nothing is assigned", async () => {
    const del = jest.fn().mockResolvedValue({});
    const tx = {
      category: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pay-1",
          name: "Visa",
          hidden: false,
          categoryGroupId: "group-cc",
          paymentForAccountId: "visa",
        }),
        delete: del,
        count: jest.fn().mockResolvedValue(0),
      },
      categoryMonth: { count: jest.fn().mockResolvedValue(0) },
      categoryTarget: { count: jest.fn().mockResolvedValue(0) },
      transaction: { count: jest.fn().mockResolvedValue(0) },
      categoryGroup: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ name: CREDIT_CARD_PAYMENTS_GROUP, sortOrder: 3, systemKind: "CREDIT_CARD_PAYMENTS" }),
        delete: jest.fn().mockResolvedValue({}),
      },
    };

    await syncPaymentCategory(tx as never, {
      budgetId: "budget-1",
      actorId: "user-1",
      accountId: "visa",
      before: account(),
      after: account({ type: "CHECKING" }),
    });

    expect(del).toHaveBeenCalledWith({ where: { id: "pay-1" } });
    expect(tx.categoryGroup.delete).toHaveBeenCalled();
  });

  it("refuses to stop being a card while the Payment Category has money assigned", async () => {
    const tx = {
      category: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pay-1",
          name: "Visa",
          hidden: false,
          categoryGroupId: "group-cc",
          paymentForAccountId: "visa",
        }),
      },
      categoryMonth: { count: jest.fn().mockResolvedValue(1) },
      categoryTarget: { count: jest.fn().mockResolvedValue(0) },
      transaction: { count: jest.fn().mockResolvedValue(0) },
    };

    await expect(
      syncPaymentCategory(tx as never, {
        budgetId: "budget-1",
        actorId: "user-1",
        accountId: "visa",
        before: account(),
        after: account({ type: "CHECKING" }),
      }),
    ).rejects.toThrow(PAYMENT_CATEGORY_IN_USE);
  });
});

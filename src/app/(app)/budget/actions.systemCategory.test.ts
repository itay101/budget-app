import {
  createCategory,
  deleteCategoryGroup,
  moveCategory,
  renameCategory,
  renameCategoryGroup,
  setBudgeted,
  setCategoryHidden,
  setTarget,
  transferAvailable,
} from "@/app/(app)/budget/actions";
import { prisma } from "@/lib/prisma";
import { requireCategoryAccess, requireCategoryGroupAccess } from "@/lib/authorization";
import { requireNavigableMonth } from "@/lib/budget";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/authorization", () => ({
  requireCategoryAccess: jest.fn(),
  requireCategoryGroupAccess: jest.fn(),
}));
jest.mock("@/lib/budget", () => ({
  getCurrentBudget: jest.fn(),
  requireNavigableMonth: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    category: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), count: jest.fn() },
    categoryGroup: { findUniqueOrThrow: jest.fn() },
    categoryMonth: { findUnique: jest.fn() },
    categoryTarget: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const access = { user: { id: "user-1" }, budgetId: "budget-1" };
const systemCategory = { ...access, systemKind: "READY_TO_ASSIGN" };
const ordinaryCategory = { ...access, systemKind: null };
const systemGroup = { ...access, systemKind: "INFLOW" };
const ordinaryGroup = { ...access, systemKind: null };

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

const REFUSED = "Inflow: Ready to Assign can't be changed";

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requireNavigableMonth).mockResolvedValue(new Date(Date.UTC(2026, 10, 1)));
});

describe("budget actions on the system Inflow: Ready to Assign category", () => {
  beforeEach(() => {
    jest.mocked(requireCategoryAccess).mockResolvedValue(systemCategory as never);
    jest.mocked(requireCategoryGroupAccess).mockResolvedValue(ordinaryGroup as never);
  });

  it.each([
    ["renameCategory", () => renameCategory(form({ categoryId: "rta", name: "Paychecks" }))],
    ["setCategoryHidden", () => setCategoryHidden(form({ categoryId: "rta", hidden: "true" }))],
    ["setBudgeted", () => setBudgeted(form({ categoryId: "rta", month: "2026-11", amount: "10" }))],
    ["setTarget", () => setTarget(form({ categoryId: "rta", month: "2026-11", kind: "SET_ASIDE" }))],
    ["moveCategory", () => moveCategory(form({ categoryId: "rta", targetGroupId: "group-1" }))],
    [
      "transferAvailable (from)",
      () => transferAvailable(form({ fromCategoryId: "rta", toCategoryId: "c-2", month: "2026-11", amount: "5" })),
    ],
  ])("%s is refused before anything is written", async (_name, run) => {
    await expect(run()).rejects.toThrow(REFUSED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("transferAvailable (to) is refused too", async () => {
    jest
      .mocked(requireCategoryAccess)
      .mockImplementation((id: string) =>
        Promise.resolve((id === "rta" ? systemCategory : ordinaryCategory) as never),
      );
    await expect(
      transferAvailable(form({ fromCategoryId: "c-1", toCategoryId: "rta", month: "2026-11", amount: "5" })),
    ).rejects.toThrow(REFUSED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("budget actions on the system Inflow group", () => {
  beforeEach(() => {
    jest.mocked(requireCategoryGroupAccess).mockResolvedValue(systemGroup as never);
    jest.mocked(requireCategoryAccess).mockResolvedValue(ordinaryCategory as never);
  });

  it.each([
    ["renameCategoryGroup", () => renameCategoryGroup(form({ categoryGroupId: "inflow", name: "Income" }))],
    ["deleteCategoryGroup", () => deleteCategoryGroup(form({ categoryGroupId: "inflow" }))],
    ["createCategory (into it)", () => createCategory(form({ categoryGroupId: "inflow", name: "Bonus" }))],
    ["moveCategory (into it)", () => moveCategory(form({ categoryId: "c-1", targetGroupId: "inflow" }))],
  ])("%s is refused before anything is written", async (_name, run) => {
    await expect(run()).rejects.toThrow(REFUSED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

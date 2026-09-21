import { transferOwnership } from "@/app/budgets/membershipActions";
import { prisma } from "@/lib/prisma";
import { requireBudgetOwnership } from "@/lib/authorization";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

jest.mock("@/lib/authorization", () => ({
  requireBudgetOwnership: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    budgetMembership: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockRequireBudgetOwnership = jest.mocked(requireBudgetOwnership);
const mockFindUniqueMembership = jest.mocked(prisma.budgetMembership.findUnique);
const mockTransaction = jest.mocked(prisma.$transaction);

function transferFormData(budgetId: string, userId: string): FormData {
  const formData = new FormData();
  formData.set("budgetId", budgetId);
  formData.set("userId", userId);
  return formData;
}

describe("transferOwnership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects a non-owner (same 'Budget not found' requireBudgetOwnership gives any non-owner) without touching membership or ownership", async () => {
    mockRequireBudgetOwnership.mockRejectedValue(new Error("Budget not found"));

    await expect(transferOwnership(transferFormData("budget-1", "candidate-1"))).rejects.toThrow(
      "Budget not found",
    );

    expect(mockFindUniqueMembership).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects transferring to a user who isn't an existing collaborator, without touching ownership", async () => {
    mockRequireBudgetOwnership.mockResolvedValue({
      user: { id: "owner-1" },
      budget: { id: "budget-1" },
    } as never);
    mockFindUniqueMembership.mockResolvedValue(null);

    await expect(
      transferOwnership(transferFormData("budget-1", "not-a-collaborator")),
    ).rejects.toThrow("Only an existing collaborator can be made the owner");

    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

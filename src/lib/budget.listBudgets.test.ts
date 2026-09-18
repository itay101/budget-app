import { getCurrentUser } from "@/lib/auth";
import { accessibleBudgetWhere } from "@/lib/authorization";
import { listBudgets } from "@/lib/budget";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    budget: {
      findMany: jest.fn(),
    },
  },
}));

const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockFindMany = jest.mocked(prisma.budget.findMany);

describe("listBudgets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: "signed-in-user" } as never);
  });

  it("requests the signed-in user's accessible, non-deleted budgets with sharing details", async () => {
    mockFindMany.mockResolvedValue([]);

    await expect(listBudgets()).resolves.toEqual([]);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        deleted: false,
        ...accessibleBudgetWhere("signed-in-user"),
      },
      orderBy: { createdAt: "asc" },
      include: {
        owner: { select: { email: true } },
        memberships: { include: { user: { select: { email: true } } } },
        invites: {
          select: { id: true, email: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });

  it("returns collaborator and pending-invite summaries for an owned budget", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "owned-budget",
        name: "Household",
        currency: "USD",
        ownerId: "signed-in-user",
        owner: { email: "owner@example.com" },
        memberships: [
          {
            userId: "collaborator-1",
            user: { email: "collaborator@example.com" },
          },
        ],
        invites: [{ id: "invite-1", email: "pending@example.com" }],
      },
    ] as never);

    await expect(listBudgets()).resolves.toEqual([
      {
        id: "owned-budget",
        name: "Household",
        currency: "USD",
        isOwner: true,
        ownerEmail: "owner@example.com",
        collaborators: [
          { userId: "collaborator-1", email: "collaborator@example.com" },
        ],
        pendingInvites: [{ id: "invite-1", email: "pending@example.com" }],
      },
    ]);
  });

  it("returns empty sharing lists when an owned budget has no collaborators or invites", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "solo-budget",
        name: "Personal",
        currency: "EUR",
        ownerId: "signed-in-user",
        owner: { email: "owner@example.com" },
        memberships: [],
        invites: [],
      },
    ] as never);

    await expect(listBudgets()).resolves.toEqual([
      {
        id: "solo-budget",
        name: "Personal",
        currency: "EUR",
        isOwner: true,
        ownerEmail: "owner@example.com",
        collaborators: [],
        pendingInvites: [],
      },
    ]);
  });

  it("redacts collaborators and pending invites from a shared budget", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "shared-budget",
        name: "Trip",
        currency: "GBP",
        ownerId: "another-user",
        owner: { email: "another-owner@example.com" },
        memberships: [
          {
            userId: "signed-in-user",
            user: { email: "signed-in@example.com" },
          },
          {
            userId: "other-collaborator",
            user: { email: "private-collaborator@example.com" },
          },
        ],
        invites: [{ id: "private-invite", email: "private-invite@example.com" }],
      },
    ] as never);

    await expect(listBudgets()).resolves.toEqual([
      {
        id: "shared-budget",
        name: "Trip",
        currency: "GBP",
        isOwner: false,
        ownerEmail: "another-owner@example.com",
        collaborators: [],
        pendingInvites: [],
      },
    ]);
  });
});

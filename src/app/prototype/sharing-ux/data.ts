// PROTOTYPE data for the sharing UI/UX exploration (issue #59). There is no
// User/Membership model in the schema yet — this is fake, in-memory data
// shaped roughly like what sharing will eventually need, just enough to
// drive three mockups of the invite/switcher/collaborator/leave flows.

export type PersonRole = "owner" | "collaborator";
export type PersonStatus = "accepted" | "pending";

export interface Person {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarColor: string;
  role: PersonRole;
  status: PersonStatus;
  /** True for the single entry representing whoever is looking at the prototype. */
  isViewer?: boolean;
}

export interface FakeBudget {
  id: string;
  name: string;
  currency: string;
  currencySymbol: string;
  people: Person[];
}

export const INITIAL_BUDGETS: FakeBudget[] = [
  {
    id: "household",
    name: "Household",
    currency: "ILS",
    currencySymbol: "₪",
    people: [
      {
        id: "you",
        name: "You",
        email: "itay@example.com",
        initials: "IT",
        avatarColor: "bg-brand-700",
        role: "owner",
        status: "accepted",
        isViewer: true,
      },
      {
        id: "noa",
        name: "Noa Levi",
        email: "noa@example.com",
        initials: "NL",
        avatarColor: "bg-discovery",
        role: "collaborator",
        status: "accepted",
      },
      {
        id: "yossi",
        name: "Yossi Mizrahi",
        email: "yossi@example.com",
        initials: "YM",
        avatarColor: "bg-info",
        role: "collaborator",
        status: "pending",
      },
    ],
  },
  {
    id: "vacation",
    name: "Vacation Fund",
    currency: "USD",
    currencySymbol: "$",
    people: [
      {
        id: "you",
        name: "You",
        email: "itay@example.com",
        initials: "IT",
        avatarColor: "bg-brand-700",
        role: "owner",
        status: "accepted",
        isViewer: true,
      },
    ],
  },
  {
    id: "roommates",
    name: "Roommates",
    currency: "ILS",
    currencySymbol: "₪",
    people: [
      {
        id: "dana",
        name: "Dana Cohen",
        email: "dana@example.com",
        initials: "DC",
        avatarColor: "bg-warning",
        role: "owner",
        status: "accepted",
      },
      {
        id: "you",
        name: "You",
        email: "itay@example.com",
        initials: "IT",
        avatarColor: "bg-brand-700",
        role: "collaborator",
        status: "accepted",
        isViewer: true,
      },
      {
        id: "noa2",
        name: "Noa Levi",
        email: "noa@example.com",
        initials: "NL",
        avatarColor: "bg-discovery",
        role: "collaborator",
        status: "accepted",
      },
    ],
  },
];

export function owner(budget: FakeBudget): Person {
  return budget.people.find((p) => p.role === "owner")!;
}

export function viewerRole(budget: FakeBudget): PersonRole {
  return budget.people.find((p) => p.isViewer)?.role ?? "owner";
}

export function isSharedWithViewer(budget: FakeBudget): boolean {
  return viewerRole(budget) === "collaborator";
}

const AVATAR_COLORS = [
  "bg-discovery",
  "bg-info",
  "bg-warning",
  "bg-success",
  "bg-danger",
];

let inviteCounter = 0;

export function makeInvitedPerson(email: string): Person {
  inviteCounter += 1;
  const namePart = email.split("@")[0] || email;
  const initials = namePart.slice(0, 2).toUpperCase();
  return {
    id: `invite-${inviteCounter}`,
    name: email,
    email,
    initials,
    avatarColor: AVATAR_COLORS[inviteCounter % AVATAR_COLORS.length],
    role: "collaborator",
    status: "pending",
  };
}

// PROTOTYPE (#145): throwaway, in-memory mock data for the credit card
// budget-page variants. Nothing here touches the database. The maths follows
// ADR 0010 (cash first, per month, split across cards in whole cents) just
// closely enough for the UI to have realistic numbers to show.

export type CashAccount = { id: string; name: string; balance: number };

export type Card = {
  id: string;
  name: string;
  // What the card owed before this month (negative = card is in credit).
  priorOwed: number;
  // Payment Category Available carried in from earlier months.
  prevAvailable: number;
  budgeted: number;
  payments: number;
  closed: boolean;
};

export type SpendRow = {
  id: string;
  name: string;
  budgeted: number;
  // Outflows as positive milliunits.
  cashSpending: number;
  cardSpending: { cardId: string; amount: number }[];
};

export type ProtoState = {
  cashAccounts: CashAccount[];
  cards: Card[];
  rows: SpendRow[];
  // Closed cards whose leftover money was moved to Ready to Assign.
  released: Record<string, number>;
  log: string[];
};

export const initialState: ProtoState = {
  cashAccounts: [
    { id: "checking", name: "עו״ש בנק לאומי", balance: 4_200_000 },
    { id: "savings", name: "Savings", balance: 10_000_000 },
  ],
  cards: [
    {
      id: "chase",
      name: "Chase Sapphire",
      priorOwed: 1_100_000,
      prevAvailable: 1_133_330,
      budgeted: 0,
      payments: 0,
      closed: false,
    },
    {
      id: "isracard",
      name: "ישראכרט זהב",
      priorOwed: 1_860_000,
      prevAvailable: 1_246_670,
      budgeted: 0,
      payments: 0,
      closed: false,
    },
    {
      id: "amex",
      name: "Amex Gold",
      priorOwed: -25_000,
      prevAvailable: 60_000,
      budgeted: 0,
      payments: 0,
      closed: false,
    },
    {
      id: "discover",
      name: "Discover it",
      priorOwed: 0,
      prevAvailable: 45_000,
      budgeted: 0,
      payments: 0,
      closed: true,
    },
  ],
  rows: [
    {
      id: "groceries",
      name: "Supermarket",
      budgeted: 600_000,
      cashSpending: 450_000,
      cardSpending: [{ cardId: "isracard", amount: 230_000 }],
    },
    {
      id: "dining",
      name: "Dining Out",
      budgeted: 100_000,
      cashSpending: 160_000,
      cardSpending: [],
    },
    {
      id: "fuel",
      name: "דלק ותחבורה",
      budgeted: 200_000,
      cashSpending: 260_000,
      cardSpending: [{ cardId: "isracard", amount: 90_000 }],
    },
    {
      id: "household",
      name: "Household",
      budgeted: 100_000,
      cashSpending: 0,
      cardSpending: [
        { cardId: "chase", amount: 100_000 },
        { cardId: "isracard", amount: 50_000 },
      ],
    },
    {
      id: "gifts",
      name: "מתנות לחגים",
      budgeted: 150_000,
      cashSpending: 0,
      cardSpending: [{ cardId: "chase", amount: 40_000 }],
    },
  ],
  released: {},
  log: [],
};

const CENT = 10; // milliunits

/** Split `total` across `weights` in whole cents, largest remainder first. */
function splitCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const cents = Math.round(total / CENT);
  const exact = weights.map((w) => (cents * w) / sum);
  const floors = exact.map(Math.floor);
  let left = cents - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, r: e - Math.floor(e) }))
    .sort((a, b) => b.r - a.r);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors.map((c) => c * CENT);
}

export type RowView = SpendRow & {
  cardTotal: number;
  activity: number;
  available: number;
  funded: number;
  creditOverspend: number;
  cashOverspend: number;
  fundedByCard: Record<string, number>;
  creditByCard: Record<string, number>;
};

export function viewRow(row: SpendRow): RowView {
  const cardTotal = row.cardSpending.reduce((a, c) => a + c.amount, 0);
  const cashLeft = row.budgeted - row.cashSpending;
  const funded = Math.min(Math.max(cashLeft, 0), cardTotal);
  const weights = row.cardSpending.map((c) => c.amount);
  const fundedShares = splitCents(funded, weights);
  const fundedByCard: Record<string, number> = {};
  const creditByCard: Record<string, number> = {};
  row.cardSpending.forEach((c, i) => {
    fundedByCard[c.cardId] = fundedShares[i];
    creditByCard[c.cardId] = c.amount - fundedShares[i];
  });
  const activity = -(row.cashSpending + cardTotal);
  return {
    ...row,
    cardTotal,
    activity,
    available: row.budgeted + activity,
    funded,
    creditOverspend: cardTotal - funded,
    cashOverspend: Math.max(0, -cashLeft),
    fundedByCard,
    creditByCard,
  };
}

export type CardView = Card & {
  spending: number;
  funded: number;
  activity: number;
  available: number;
  owed: number;
  // How much more the card owes than its Payment Category holds (0 if covered).
  shortfall: number;
  // Where the shortfall comes from: this month's credit overspending per
  // category, plus debt that predates the budget / earlier months.
  creditSources: { rowId: string; name: string; amount: number }[];
};

export function viewCards(state: ProtoState): CardView[] {
  const rows = state.rows.map(viewRow);
  return state.cards.map((card) => {
    let spending = 0;
    let funded = 0;
    const creditSources: CardView["creditSources"] = [];
    for (const row of rows) {
      const spend = row.cardSpending.find((c) => c.cardId === card.id);
      if (!spend) continue;
      spending += spend.amount;
      funded += row.fundedByCard[card.id];
      const credit = row.creditByCard[card.id];
      if (credit > 0) {
        creditSources.push({ rowId: row.id, name: row.name, amount: credit });
      }
    }
    const activity = funded - card.payments;
    const released = state.released[card.id] ?? 0;
    const available = card.prevAvailable + card.budgeted + activity - released;
    const owed = card.priorOwed + spending - card.payments;
    return {
      ...card,
      spending,
      funded,
      activity,
      available,
      owed,
      shortfall: Math.max(0, owed - Math.max(available, 0)),
      creditSources,
    };
  });
}

export function pay(
  state: ProtoState,
  cardId: string,
  fromAccountId: string,
  amount: number,
): ProtoState {
  const card = state.cards.find((c) => c.id === cardId)!;
  const from = state.cashAccounts.find((a) => a.id === fromAccountId)!;
  return {
    ...state,
    cards: state.cards.map((c) =>
      c.id === cardId ? { ...c, payments: c.payments + amount } : c,
    ),
    cashAccounts: state.cashAccounts.map((a) =>
      a.id === fromAccountId ? { ...a, balance: a.balance - amount } : a,
    ),
    log: [
      ...state.log,
      `Transfer ${amount / 1000} from "${from.name}" to "${card.name}"`,
    ],
  };
}

export function releaseClosed(state: ProtoState, cardId: string): ProtoState {
  const view = viewCards(state).find((c) => c.id === cardId)!;
  if (view.available <= 0) return state;
  return {
    ...state,
    released: {
      ...state.released,
      [cardId]: (state.released[cardId] ?? 0) + view.available,
    },
    log: [
      ...state.log,
      `Moved ${view.available / 1000} from closed "${view.name}" to Ready to Assign`,
    ],
  };
}

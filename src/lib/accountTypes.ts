export const ACCOUNT_TYPE_OPTIONS = [
  { value: "CHECKING", label: "Checking" },
  { value: "SAVINGS", label: "Savings" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "CASH", label: "Cash" },
  { value: "LINE_OF_CREDIT", label: "Line of Credit" },
  { value: "OTHER", label: "Other" },
] as const;

export const ACCOUNT_TYPES = ACCOUNT_TYPE_OPTIONS.map((o) => o.value);

export type AccountType = (typeof ACCOUNT_TYPES)[number];

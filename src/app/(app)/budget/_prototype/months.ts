// PROTOTYPE ONLY (issue #136): `YYYY-MM` month helpers (UTC, per issue
// #124), kept out of the client module so the server page can use them too.

export function monthLabel(
  month: string,
  style: "long" | "short" = "long",
): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: style,
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

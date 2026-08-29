// Relative date-range presets for the transactions list filter (ticket #19).
// Ranges are computed off the viewer's local calendar date, matching how
// transaction dates are compared elsewhere in the app (`date.slice(0, 10)`
// against ISO date strings) rather than UTC.

export type DateRangePreset = "mtd" | "30d" | "3m" | "ytd" | "1y";

export const DATE_RANGE_PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: "mtd", label: "Month to date" },
  { key: "30d", label: "30 days" },
  { key: "3m", label: "Last 3 months" },
  { key: "ytd", label: "Year to date" },
  { key: "1y", label: "1 year" },
];

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayISODate(): string {
  return toISODate(new Date());
}

// The {from, to} range for a preset, anchored on today's local date. `to`
// is always today; `from` is today shifted back per preset.
export function presetDateRange(preset: DateRangePreset): {
  from: string;
  to: string;
} {
  const today = new Date();
  const to = toISODate(today);

  switch (preset) {
    case "mtd":
      return {
        from: toISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
        to,
      };
    case "30d": {
      const from = new Date(today);
      from.setDate(from.getDate() - 30);
      return { from: toISODate(from), to };
    }
    case "3m": {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 3);
      return { from: toISODate(from), to };
    }
    case "ytd":
      return { from: toISODate(new Date(today.getFullYear(), 0, 1)), to };
    case "1y": {
      const from = new Date(today);
      from.setFullYear(from.getFullYear() - 1);
      return { from: toISODate(from), to };
    }
  }
}

import {
  hasActiveTransactionFilters,
  parseTransactionFilters,
  parseTransactionFiltersFromSearchParams,
} from "./transactionFilters";

describe("parseTransactionFilters", () => {
  it("falls back to a null preset for an unrecognized value", () => {
    expect(parseTransactionFilters({ preset: "not-a-preset" }).preset).toBe(
      null,
    );
  });

  it("accepts every recognized preset", () => {
    for (const preset of ["mtd", "30d", "3m", "ytd", "1y"]) {
      expect(parseTransactionFilters({ preset }).preset).toBe(preset);
    }
  });

  it("falls back to 'all' for an unrecognized direction", () => {
    expect(parseTransactionFilters({ direction: "sideways" }).direction).toBe(
      "all",
    );
  });

  it("accepts inflow and outflow", () => {
    expect(parseTransactionFilters({ direction: "inflow" }).direction).toBe(
      "inflow",
    );
    expect(parseTransactionFilters({ direction: "outflow" }).direction).toBe(
      "outflow",
    );
  });

  it("defaults every field to its empty/unfiltered value on empty params", () => {
    expect(parseTransactionFilters({})).toEqual({
      dateFrom: "",
      dateTo: "",
      preset: null,
      category: "",
      direction: "all",
      q: "",
    });
  });
});

describe("parseTransactionFiltersFromSearchParams", () => {
  it("keeps the first value for a duplicated query key, matching parseTransactionFilters/URLSearchParams.get", () => {
    const params = new URLSearchParams();
    params.append("direction", "inflow");
    params.append("direction", "outflow");

    expect(parseTransactionFiltersFromSearchParams(params).direction).toBe(
      "inflow",
    );
    expect(params.get("direction")).toBe("inflow");
  });

  it("agrees with parseTransactionFilters on a single-valued URL", () => {
    const params = new URLSearchParams({
      from: "2026-01-01",
      category: "cat-1",
      direction: "outflow",
      q: "coffee",
    });

    expect(parseTransactionFiltersFromSearchParams(params)).toEqual(
      parseTransactionFilters({
        from: "2026-01-01",
        category: "cat-1",
        direction: "outflow",
        q: "coffee",
      }),
    );
  });
});

describe("hasActiveTransactionFilters", () => {
  it("is false on empty params", () => {
    const filters = parseTransactionFilters({});
    expect(hasActiveTransactionFilters(filters)).toBe(false);
  });

  it("is true once any single filter is set", () => {
    expect(
      hasActiveTransactionFilters(parseTransactionFilters({ q: "coffee" })),
    ).toBe(true);
    expect(
      hasActiveTransactionFilters(
        parseTransactionFilters({ category: "cat-1" }),
      ),
    ).toBe(true);
    expect(
      hasActiveTransactionFilters(
        parseTransactionFilters({ direction: "inflow" }),
      ),
    ).toBe(true);
    expect(
      hasActiveTransactionFilters(
        parseTransactionFilters({ from: "2026-01-01" }),
      ),
    ).toBe(true);
  });
});

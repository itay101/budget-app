import { loadImportMapping, saveImportMapping } from "./importMappingPreferences";

// The default jest environment for this project is "node", which has no
// `window`/`localStorage` - simulate just enough of it (a real Map-backed
// Storage) rather than pulling in jsdom for one module.
function installFakeLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage };
  return localStorage;
}

function uninstallFakeLocalStorage() {
  delete (globalThis as unknown as { window?: unknown }).window;
}

describe("importMappingPreferences", () => {
  afterEach(() => {
    uninstallFakeLocalStorage();
  });

  it("returns null when nothing has been saved for the account yet", () => {
    installFakeLocalStorage();
    expect(loadImportMapping("acct-1")).toBeNull();
  });

  it("round-trips a saved mapping", () => {
    installFakeLocalStorage();
    const mapping = {
      date: "Transaction Date",
      payee: "Description",
      memo: null,
      amountMode: "split" as const,
      amount: null,
      inflow: "Credit",
      outflow: "Debit",
      dateOrder: "DMY" as const,
    };

    saveImportMapping("acct-1", mapping);

    expect(loadImportMapping("acct-1")).toEqual(mapping);
  });

  it("keeps mappings for different accounts separate", () => {
    installFakeLocalStorage();
    saveImportMapping("acct-1", {
      date: "Date",
      payee: null,
      memo: null,
      amountMode: "single",
      amount: "Amount",
      inflow: null,
      outflow: null,
      dateOrder: "auto",
    });

    expect(loadImportMapping("acct-2")).toBeNull();
  });

  it("ignores a hand-edited entry with an invalid shape", () => {
    const localStorage = installFakeLocalStorage();
    localStorage.setItem("budget-app:import-mapping:acct-1", "{\"amountMode\":\"nonsense\"}");

    expect(loadImportMapping("acct-1")).toBeNull();
  });

  it("ignores non-JSON garbage instead of throwing", () => {
    const localStorage = installFakeLocalStorage();
    localStorage.setItem("budget-app:import-mapping:acct-1", "not json");

    expect(loadImportMapping("acct-1")).toBeNull();
  });

  it("returns null (never throws) when there is no window at all", () => {
    expect(loadImportMapping("acct-1")).toBeNull();
    expect(() =>
      saveImportMapping("acct-1", {
        date: null,
        payee: null,
        memo: null,
        amountMode: "single",
        amount: null,
        inflow: null,
        outflow: null,
        dateOrder: "auto",
      }),
    ).not.toThrow();
  });
});

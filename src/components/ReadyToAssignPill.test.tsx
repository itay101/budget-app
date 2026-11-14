/**
 * @jest-environment jsdom
 *
 * Rendered the same way as MonthHeader.test.tsx (no @testing-library/react
 * in this repo): the drawer is portaled to document.body.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReadyToAssignPill } from "@/components/ReadyToAssignPill";
import type { ReadyToAssignBreakdown } from "@/lib/readyToAssign";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function breakdown(overrides: Partial<ReadyToAssignBreakdown>): ReadyToAssignBreakdown {
  return {
    leftOver: 0,
    inflow: 0,
    overspent: 0,
    assigned: 0,
    assignedFuture: 0,
    total: 0,
    state: "zero",
    ...overrides,
  };
}

const categoryOptions = [
  {
    id: "g-1",
    name: "Bills",
    categories: [
      { id: "rent", name: "Rent", available: 10_000 },
      { id: "power", name: "Power", available: -5_000 },
    ],
  },
];
const transferAvailable = jest.fn((_formData: FormData) => Promise.resolve());
const autoAssignAction = jest.fn((_formData: FormData) => Promise.resolve({ applied: [], skipped: [] }));

function render(value: ReadyToAssignBreakdown, isPast = false) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ReadyToAssignPill
        breakdown={value}
        currency="USD"
        month="2026-11"
        monthName="November 2026"
        previousMonthName="October 2026"
        isPast={isPast}
        categoryOptions={categoryOptions}
        transferAvailable={transferAvailable}
        autoAssignCategories={[]}
        autoAssign={autoAssignAction}
        undoAutoAssign={autoAssignAction}
      />,
    ),
  );
  return container.querySelector("button")!;
}

function openDrawer(pill: HTMLButtonElement) {
  act(() => pill.click());
  return document.querySelector('[role="dialog"]') as HTMLElement;
}

describe("ReadyToAssignPill", () => {
  it.each([
    ["positive", 125_500, "$125.50", "Ready to Assign", "bg-target-funded-bg"],
    ["zero", 0, "$0.00", "All Money Assigned", "bg-neutral-100"],
    ["negative", -40_000, "-$40.00", "You assigned more than you have", "bg-target-overspent-bg"],
  ] as const)("shows the %s state's amount, label and colour", (state, total, amount, label, fill) => {
    const pill = render(breakdown({ state, total }));
    expect(pill.textContent).toContain(amount);
    expect(pill.textContent).toContain(label);
    expect(pill.className).toContain(fill);
  });

  it("opens a drawer whose signed Breakdown lines lead to the total", () => {
    const pill = render(
      breakdown({
        leftOver: 20_000,
        inflow: 100_000,
        overspent: 5_000,
        assigned: 90_000,
        assignedFuture: 10_000,
        total: 15_000,
        state: "positive",
      }),
    );
    const drawer = openDrawer(pill);

    const lines = [...drawer.querySelectorAll("dl > div")].map((row) => row.textContent);
    expect(lines).toEqual([
      "Left over from October 2026+$20.00",
      "Inflow: Ready to Assign in November 2026+$100.00",
      "Cash overspending in October 2026−$5.00",
      "Assigned in November 2026−$90.00",
      "Assigned in future months−$10.00",
      "Ready to Assign=$15.00",
    ]);
    expect(drawer.textContent).toContain("Give it a job before you spend it");
  });

  it("shows a negative left-over as a subtraction and drops the future line in a past month", () => {
    const drawer = openDrawer(render(breakdown({ leftOver: -20_000, total: -20_000, state: "negative" }), true));

    const lines = [...drawer.querySelectorAll("dl > div")].map((row) => row.textContent);
    expect(lines[0]).toBe("Left over from October 2026−$20.00");
    expect(lines.some((line) => line?.startsWith("Assigned in future months"))).toBe(false);
  });

  it("closes on Escape", () => {
    openDrawer(render(breakdown({})));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("ReadyToAssignPill's Assign money form", () => {
  function assignForm(total: number) {
    const drawer = openDrawer(render(breakdown({ total, state: total > 0 ? "positive" : total < 0 ? "negative" : "zero" })));
    return drawer.querySelector('form[aria-label="Assign money"]') as HTMLFormElement;
  }

  function setAmount(form: HTMLFormElement, value: string) {
    const input = form.querySelector('input[name="amount"]') as HTMLInputElement;
    // React tracks the value itself; go through the native setter so onChange fires.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("prefills all of a positive Ready to Assign and previews both figures", () => {
    const form = assignForm(15_000);
    expect((form.querySelector('input[name="amount"]') as HTMLInputElement).value).toBe("15");

    const preview = [...form.querySelectorAll('[aria-label="After assigning"] > p')].map((row) => row.textContent);
    expect(preview).toEqual(["Ready to Assign after$0.00", "Rent after$25.00"]);
    expect(form.textContent).not.toContain("assigns more than you have");
  });

  it("leaves the amount empty when there's nothing to assign", () => {
    const form = assignForm(-5_000);
    expect((form.querySelector('input[name="amount"]') as HTMLInputElement).value).toBe("");
  });

  it("turns the preview red when assigning more than there is, and still allows it", async () => {
    const form = assignForm(15_000);
    setAmount(form, "20");

    expect(form.textContent).toContain("Ready to Assign after-$5.00");
    expect(form.querySelector('[role="status"]')!.textContent).toBe(
      "This assigns more than you have. You can still do it.",
    );
    const assign = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(assign.disabled).toBe(false);

    transferAvailable.mockClear();
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const data = transferAvailable.mock.calls[0][0];
    expect([data.get("fromCategoryId"), data.get("toCategoryId"), data.get("amount"), data.get("month")]).toEqual([
      "READY_TO_ASSIGN",
      "rent",
      "20",
      "2026-11",
    ]);
  });
});

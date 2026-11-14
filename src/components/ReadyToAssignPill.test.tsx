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

function render(value: ReadyToAssignBreakdown, isPast = false) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ReadyToAssignPill
        breakdown={value}
        currency="USD"
        monthName="November 2026"
        previousMonthName="October 2026"
        isPast={isPast}
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

/**
 * @jest-environment jsdom
 *
 * The budget row's Target cell (#171), rendered the same way as
 * MonthHeader.test.tsx (no @testing-library/react in this repo).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TargetCell } from "@/components/TargetCell";
import { needFor, targetStatus, type Target } from "@/lib/targets";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const oct = new Date(Date.UTC(2026, 9, 1));
const monthly: Target = { kind: "SET_ASIDE", cadence: "MONTHLY", amount: 400000, weekday: null, dueDay: 15, dueDate: null };

function render(numbers: { target: Target | null; carriedIn?: number; budgeted?: number; activity?: number; snoozed?: boolean }) {
  const carriedIn = numbers.carriedIn ?? 0;
  const budgeted = numbers.budgeted ?? 0;
  const available = carriedIn + budgeted + (numbers.activity ?? 0);
  const funding = { carriedIn, assigned: budgeted, snoozed: numbers.snoozed };
  const need = numbers.target ? needFor(numbers.target, funding, oct) : null;
  const row = { target: numbers.target, need, carriedIn, budgeted, available };
  const onToggle = jest.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <TargetCell
        row={row}
        status={targetStatus(numbers.target, need, { ...funding, available })}
        month="2026-10"
        currency="USD"
        open={false}
        onToggle={onToggle}
      />,
    );
  });
  return { onToggle };
}

const text = () => container.textContent?.replace(/[⁦⁩]/g, "");

describe("TargetCell", () => {
  it("offers Add target without one, and toggles the editor", () => {
    const { onToggle } = render({ target: null });
    const button = container.querySelector("button")!;
    expect(button.textContent).toContain("Add target");
    act(() => button.click());
    expect(onToggle).toHaveBeenCalled();
  });

  it("shows an underfunded target's progress, due day and what it still needs", () => {
    render({ target: monthly, budgeted: 250000 });
    expect(text()).toContain("$250.00 of $400.00");
    expect(text()).toContain("by the 15th");
    expect(text()).toContain("$150.00 more");
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("63");
  });

  it("labels a funded and a snoozed target", () => {
    render({ target: monthly, budgeted: 400000 });
    expect(text()).toContain("Funded");
    act(() => root.unmount());
    container.remove();
    render({ target: monthly, snoozed: true });
    expect(text()).toContain("Snoozed");
  });

  it("shows how far an overspent category went past 100%", () => {
    render({ target: monthly, budgeted: 400000, activity: -500000 });
    expect(text()).toContain("+$100.00 · 125%");
    expect(text()).toContain("Overspent");
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toMatch(/^Overspent/);
  });

  it("shows an overspent category without a target too", () => {
    render({ target: null, activity: -20000 });
    expect(text()).toContain("+$20.00");
    expect(text()).not.toContain("Add target");
  });
});

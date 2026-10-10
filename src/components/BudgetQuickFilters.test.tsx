/**
 * @jest-environment jsdom
 *
 * The Underfunded banner and quick filters (#171), rendered the same way as
 * MonthHeader.test.tsx, with next/link swapped for a plain anchor.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QuickFilterBar, UnderfundedBanner } from "@/components/BudgetQuickFilters";
import type { PlanTotals } from "@/lib/targets";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(node);
  });
}

const text = () => container.textContent?.replace(/[⁦⁩]/g, "");
const totals = (needed: number, overspending: number): PlanTotals => ({
  needed,
  overspending,
  underfunded: needed + overspending,
  costToBeMe: 0,
});

describe("UnderfundedBanner", () => {
  it("totals what's needed and overspent, and links to the Underfunded filter", () => {
    render(
      <UnderfundedBanner
        totals={totals(850000, 150000)}
        counts={{ count: 3, hidden: 1, snoozed: 2 }}
        month="2026-10"
        filter="all"
        currency="USD"
      />,
    );
    expect(text()).toContain("$850.00 still needed across 3 categories, plus $150.00 overspending to cover.");
    expect(text()).toContain("1 hidden included. 2 snoozed not counted.");
    const link = container.querySelector("a")!;
    expect(link.textContent).toBe("Show only these");
    expect(link.getAttribute("href")).toBe("/budget?month=2026-10&filter=underfunded");
  });

  it("links back to All while the Underfunded filter is on", () => {
    render(
      <UnderfundedBanner totals={totals(1000, 0)} counts={{ count: 1, hidden: 0, snoozed: 0 }} month="2026-10" filter="underfunded" currency="USD" />,
    );
    expect(text()).toContain("still needed across 1 category.");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/budget?month=2026-10");
  });

  it("shows overspending alone, with nothing to filter", () => {
    render(
      <UnderfundedBanner totals={totals(0, 20000)} counts={{ count: 0, hidden: 0, snoozed: 0 }} month="2026-10" filter="all" currency="USD" />,
    );
    expect(text()).toContain("$20.00 overspending to cover.");
    expect(container.querySelector("a")).toBeNull();
  });

  it("says every target is funded when nothing is short", () => {
    render(
      <UnderfundedBanner totals={totals(0, 0)} counts={{ count: 0, hidden: 0, snoozed: 1 }} month="2026-10" filter="all" currency="USD" />,
    );
    expect(text()).toContain("Every target is funded this month.");
  });
});

describe("QuickFilterBar", () => {
  it("links each filter with its count and marks the active one", () => {
    render(
      <QuickFilterBar
        counts={{ all: 8, snoozed: 1, underfunded: 5, overfunded: 2, available: 6 }}
        month="2026-10"
        filter="overfunded"
      />,
    );
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(["All8", "Snoozed1", "Underfunded5", "Overfunded2", "Money Available6"]);
    expect(links[0].getAttribute("href")).toBe("/budget?month=2026-10");
    expect(links[4].getAttribute("href")).toBe("/budget?month=2026-10&filter=available");
    expect(links.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent)).toEqual(["Overfunded2"]);
  });
});

/**
 * @jest-environment jsdom
 *
 * Rendered the same way as MonthHeader.test.tsx (no @testing-library/react
 * in this repo): the popover is portaled to document.body.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MoveMoneyPopover } from "@/components/MoveMoneyPopover";
import { ReadyToAssignProvider } from "@/components/ReadyToAssignContext";
import { READY_TO_ASSIGN } from "@/lib/readyToAssign";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const transferAvailable = jest.fn((_formData: FormData) => Promise.resolve());
const noop = jest.fn((_formData: FormData) => Promise.resolve({ applied: [], skipped: [] }));
const autoAssign = { categories: [], limit: 0, run: noop, undo: noop };

const groups = [
  {
    id: "g-1",
    name: "Bills",
    categories: [
      { id: "rent", name: "Rent", available: 10_000 },
      { id: "power", name: "Power", available: 2_000 },
    ],
  },
];

beforeEach(() => {
  transferAvailable.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ReadyToAssignProvider total={55_000} autoAssign={autoAssign}>
        <MoveMoneyPopover
          categoryId="rent"
          categoryName="Rent"
          month="2026-11"
          currency="USD"
          available={10_000}
          groups={groups}
          transferAvailable={transferAvailable}
        />
      </ReadyToAssignProvider>,
    ),
  );
  // getBoundingClientRect is all zeros in jsdom, which is fine for usePopover.
  act(() => container.querySelector("button")!.click());
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function dialog() {
  return document.querySelector('[role="dialog"]') as HTMLElement;
}

async function submit(amount: string, other: string) {
  const form = dialog().querySelector("form")!;
  (form.querySelector('input[name="amount"]') as HTMLInputElement).value = amount;
  (form.querySelector('select[name="other"]') as HTMLSelectElement).value = other;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  const data = transferAvailable.mock.calls[0][0];
  return { from: data.get("fromCategoryId"), to: data.get("toCategoryId"), amount: data.get("amount") };
}

describe("MoveMoneyPopover", () => {
  it("lists Ready to Assign first, then the other categories, never this one", () => {
    const options = [...dialog().querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual(["Ready to Assign: $55.00", "⁨Power⁩ — $2.00"]);
  });

  it("moves money out of the category by default", async () => {
    expect(dialog().querySelector("label[for='other-rent']")!.textContent).toBe("To");
    expect(await submit("5", READY_TO_ASSIGN)).toEqual({ from: "rent", to: READY_TO_ASSIGN, amount: "5" });
  });

  it("pulls money into the category once switched to Into", async () => {
    const into = [...dialog().querySelectorAll('[role="radio"]')].find((b) => b.textContent?.startsWith("Into"))!;
    act(() => (into as HTMLButtonElement).click());

    expect(into.getAttribute("aria-checked")).toBe("true");
    expect(dialog().querySelector("label[for='other-rent']")!.textContent).toBe("From");
    expect(await submit("7", READY_TO_ASSIGN)).toEqual({ from: READY_TO_ASSIGN, to: "rent", amount: "7" });
  });
});

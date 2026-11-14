/**
 * @jest-environment jsdom
 *
 * Rendered the same way as MonthHeader.test.tsx (no @testing-library/react
 * in this repo).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AutoAssignMenu } from "@/components/AutoAssignMenu";
import { autoAssignMessage } from "@/components/ReadyToAssignPill";
import type { AutoAssignCategory } from "@/lib/autoAssign";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const autoAssign = jest.fn((_formData: FormData) =>
  Promise.resolve({ applied: [{ categoryId: "rent", from: 0, to: 30_000 }], skipped: [] as string[] }),
);
const onDone = jest.fn();

const categories: AutoAssignCategory[] = [
  { id: "rent", name: "Rent", groupId: "g", hidden: false, order: 0, assigned: 0, available: 0, needed: 30_000, due: null },
  { id: "old", name: "Old", groupId: "g", hidden: true, order: 1, assigned: 0, available: -2_000, needed: 0, due: null },
];

function render(readyToAssign: number, isPast = false) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <AutoAssignMenu
        categories={categories}
        readyToAssign={readyToAssign}
        month="2026-11"
        currency="USD"
        isPast={isPast}
        autoAssign={autoAssign}
        onDone={onDone}
      />,
    ),
  );
}

function option(name: string) {
  return [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name)) as HTMLButtonElement;
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AutoAssignMenu", () => {
  it("shows each option with what it would assign", () => {
    render(100_000);
    expect(option("Underfunded").textContent).toBe("Underfunded$32.00");
    expect(option("Underfunded").disabled).toBe(false);
  });

  it("disables options that add money when Ready to Assign is $0 or below, and in past months", () => {
    render(0);
    expect(option("Underfunded").disabled).toBe(true);
    act(() => root.unmount());
    container.remove();
    render(100_000, true);
    expect(option("Underfunded").title).toBe("Not in past months yet");
  });

  it("previews every change, then confirms the previewed rows", async () => {
    render(100_000);
    act(() => option("Underfunded").click());

    const rows = [...container.querySelectorAll("li")].map((li) => li.textContent);
    expect(rows).toEqual(["Rent$0.00 → $30.00", "Old (hidden)$0.00 → $2.00"]);

    await act(async () => option("Confirm").click());
    const data = autoAssign.mock.calls[0][0];
    expect(data.get("option")).toBe("underfunded");
    expect(JSON.parse(String(data.get("rows")))).toEqual([
      { categoryId: "rent", from: 0, to: 30_000 },
      { categoryId: "old", from: 0, to: 2_000 },
    ]);
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ option: "underfunded", total: 30_000, skipped: 0 }),
    );
  });

  it("phrases the toast for assigned, freed and skipped runs", () => {
    const run = { option: "underfunded" as const, month: "2026-11", applied: [{ categoryId: "a", from: 0, to: 1 }], skipped: 0, total: 40_000 };
    expect(autoAssignMessage(run, "USD")).toBe("Assigned $40.00 to 1 category");
    expect(autoAssignMessage({ ...run, total: -5_000, skipped: 2 }, "USD")).toBe(
      "Freed $5.00 from 1 category (2 changed since the preview, skipped)",
    );
  });
});

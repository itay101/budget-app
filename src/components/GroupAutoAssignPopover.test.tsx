/**
 * @jest-environment jsdom
 *
 * Rendered the same way as MonthHeader.test.tsx (no @testing-library/react
 * in this repo).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GroupAutoAssignPopover } from "@/components/GroupAutoAssignPopover";
import { ReadyToAssignProvider } from "@/components/ReadyToAssignContext";
import type { AutoAssignCategory } from "@/lib/autoAssign";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const run = jest.fn((_formData: FormData) =>
  Promise.resolve({ applied: [{ categoryId: "rent", from: 30_000, to: 0 }], skipped: [] as string[] }),
);
const undo = jest.fn((_formData: FormData) => Promise.resolve({ applied: [], skipped: [] as string[] }));
const noHistory = { assigned: Array(12).fill(0), spent: Array(12).fill(0), firstAssigned: null, firstActive: null };
const base = { hidden: false, available: 0, needed: 0, due: null, overfunded: 0, history: noHistory };
const categories: AutoAssignCategory[] = [
  { ...base, id: "rent", name: "Rent", groupId: "bills", order: 0, assigned: 30_000 },
  { ...base, id: "fun", name: "Fun", groupId: "wants", order: 1, assigned: 20_000 },
];

function render(withProvider = true) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const popover = <GroupAutoAssignPopover groupId="bills" groupName="Bills" month="2026-11" currency="USD" />;
  act(() =>
    root.render(
      withProvider ? (
        <ReadyToAssignProvider total={0} autoAssign={{ categories, limit: 0, run, undo }}>
          {popover}
        </ReadyToAssignProvider>
      ) : (
        popover
      ),
    ),
  );
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

describe("GroupAutoAssignPopover", () => {
  it("runs an option over only its own group's categories", async () => {
    render();
    act(() => (container.querySelector('button[title="Auto-Assign Bills"]') as HTMLButtonElement).click());
    const dialog = document.querySelector('[role="dialog"][aria-label="Auto-Assign Bills"]') as HTMLElement;
    const resetAssigned = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Reset Assigned"))!;
    act(() => resetAssigned.click());

    expect([...dialog.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Rent$30.00 → $0.00"]);
    const confirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Confirm")!;
    await act(async () => confirm.click());

    expect(JSON.parse(String(run.mock.calls[0][0].get("rows")))).toEqual([{ categoryId: "rent", from: 30_000, to: 0 }]);
    expect(document.querySelector('[role="status"]')!.textContent).toContain("Freed $30.00 from 1 category");
  });

  it("renders nothing outside a ReadyToAssignProvider", () => {
    render(false);
    expect(container.innerHTML).toBe("");
  });
});

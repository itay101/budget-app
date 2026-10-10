/**
 * @jest-environment jsdom
 *
 * The target editor (#171), rendered the same way as MonthHeader.test.tsx
 * (no @testing-library/react in this repo). The actions are jest.fn()s, so
 * these check what the form sends, not what the server stores.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TargetEditor, type TargetActions } from "@/components/TargetEditor";
import { needFor, type Target } from "@/lib/targets";
import type { TargetHistoryEntry } from "@/lib/targetDisplay";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const oct = new Date(Date.UTC(2026, 9, 1));
const refill: Target = { kind: "REFILL", cadence: "MONTHLY", amount: 600000, weekday: null, dueDay: 15, dueDate: null };
const setAside: Target = { kind: "SET_ASIDE", cadence: "MONTHLY", amount: 500000, weekday: null, dueDay: null, dueDate: null };

function render({
  target,
  history,
  snoozed = false,
  failWith,
}: {
  target: Target | null;
  history: TargetHistoryEntry[];
  snoozed?: boolean;
  failWith?: string;
}) {
  const action = () =>
    jest.fn(async () => {
      if (failWith) throw new Error(failWith);
    });
  const actions: TargetActions = { setTarget: action(), removeTarget: action(), snoozeTarget: action(), unsnoozeTarget: action() };
  const onDone = jest.fn();
  const need = target ? needFor(target, { carriedIn: 0, assigned: 300000 }, oct) : null;
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <TargetEditor
        categoryId="cat-1"
        row={{ target, need, carriedIn: 0, budgeted: 300000, available: 300000 }}
        history={history}
        snoozed={snoozed}
        month="2026-10"
        currency="USD"
        actions={actions}
        onDone={onDone}
      />,
    );
  });
  return { actions, onDone };
}

const text = () => container.textContent?.replace(/[⁦⁩]/g, "");
const button = (label: string | RegExp) =>
  [...container.querySelectorAll("button")].find((b) =>
    typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? ""),
  )!;
const sent = (fn: jest.Mock) => Object.fromEntries((fn.mock.calls[0][0] as FormData).entries());

function type(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    container.querySelector("form")!.requestSubmit();
  });
}

describe("TargetEditor", () => {
  it("says what earlier months keep and lists the history", () => {
    render({
      target: refill,
      history: [
        { startMonth: "2026-10", target: refill },
        { startMonth: "2026-06", target: setAside },
      ],
    });
    expect(text()).toContain("Applies from October 2026 onwards.");
    expect(text()).toContain("September 2026 and earlier keep: Set aside $500.00 each month.");
    expect(text()).toContain("This replaces the change already made for this month.");
    expect(text()).toContain("June 2026 – September 2026: Set aside $500.00 each month");
    expect(text()).toContain("Funded so far$300.00 of $600.00");
  });

  it("says a save only lasts until a later month's change", () => {
    render({ target: null, history: [{ startMonth: "2027-01", target: setAside }] });
    expect(text()).toContain("Applies from October 2026 until December 2026.");
    expect(text()).toContain("January 2027 onwards keeps its own change.");
  });

  it("says earlier months had no target for a new one", () => {
    render({ target: null, history: [] });
    expect(text()).toContain("September 2026 and earlier had no target");
    expect(text()).toContain("Never had a target.");
    expect(button("Remove")).toBeUndefined();
  });

  it("saves the kind, amount and schedule for the viewed month", async () => {
    const { actions, onDone } = render({ target: null, history: [] });
    act(() => button("Refill up to").click());
    type(container.querySelector('input[type="number"][step]')!, "250");
    type(container.querySelector("select")!, "WEEKLY");
    type(container.querySelectorAll("select")[1], "5");
    await submit();
    expect(sent(actions.setTarget as jest.Mock)).toEqual({
      categoryId: "cat-1",
      month: "2026-10",
      kind: "REFILL",
      amount: "250",
      cadence: "WEEKLY",
      weekday: "5",
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("asks for a due month for a dated balance", async () => {
    const { actions } = render({ target: null, history: [] });
    act(() => button("Balance by date").click());
    type(container.querySelector('input[type="number"][step]')!, "3000");
    type(container.querySelector('input[type="month"]')!, "2027-06");
    await submit();
    expect(sent(actions.setTarget as jest.Mock)).toMatchObject({ kind: "BALANCE", dated: "true", dueMonth: "2027-06" });
  });

  it("asks for a due date for a yearly target", async () => {
    const { actions } = render({ target: setAside, history: [{ startMonth: "2026-01", target: setAside }] });
    type(container.querySelector("select")!, "YEARLY");
    type(container.querySelector('input[type="date"]')!, "2027-03-15");
    await submit();
    expect(sent(actions.setTarget as jest.Mock)).toMatchObject({ cadence: "YEARLY", dueDate: "2027-03-15" });
  });

  it("snoozes, unsnoozes and removes for the viewed month", async () => {
    const history = [{ startMonth: "2026-01", target: setAside }];
    const first = render({ target: setAside, history });
    await act(async () => button(/Snooze for October$/).click());
    expect(sent(first.actions.snoozeTarget as jest.Mock)).toEqual({ categoryId: "cat-1", month: "2026-10" });
    await act(async () => button(/Remove/).click());
    expect(first.actions.removeTarget).toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();

    const second = render({ target: setAside, history, snoozed: true });
    await act(async () => button(/Unsnooze$/).click());
    expect(second.actions.unsnoozeTarget).toHaveBeenCalled();
  });

  it("shows the action's error and stays open", async () => {
    const { onDone } = render({ target: setAside, history: [], failWith: "Enter a target amount" });
    await submit();
    expect(text()).toContain("Enter a target amount");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("closes on Cancel", () => {
    const { onDone } = render({ target: null, history: [] });
    act(() => button("Cancel").click());
    expect(onDone).toHaveBeenCalled();
  });
});

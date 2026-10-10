/**
 * @jest-environment jsdom
 *
 * MonthHeader renders links and a portal-ed month grid, so it needs a real
 * DOM, rendered the same way as AddFormPopover.test.tsx (no
 * @testing-library/react in this repo). next/link is swapped for a plain
 * anchor: there's no App Router mounted here.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MonthHeader } from "@/components/MonthHeader";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: { month: string; current: string; first: string; last: string }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<MonthHeader {...props} />);
  });
}

const link = (label: string) =>
  container.querySelector<HTMLAnchorElement>(`a[aria-label="${label}"]`)!;

function openPicker() {
  const trigger = container.querySelector<HTMLButtonElement>("button[aria-haspopup]")!;
  act(() => trigger.click());
  return document.querySelector<HTMLElement>('[role="dialog"]')!;
}

describe("MonthHeader", () => {
  it("links the arrows to the neighbouring months", () => {
    render({ month: "2026-10", current: "2026-10", first: "2026-01", last: "2027-10" });
    expect(link("Previous month").getAttribute("href")).toBe("/budget?month=2026-09");
    expect(link("Next month").getAttribute("href")).toBe("/budget?month=2026-11");
    expect(link("Previous month").getAttribute("aria-disabled")).toBe("false");
  });

  it("disables an arrow at the end of the range", () => {
    render({ month: "2026-01", current: "2026-10", first: "2026-01", last: "2027-10" });
    expect(link("Previous month").getAttribute("aria-disabled")).toBe("true");
  });

  it("shows Back to the current month only away from it", () => {
    render({ month: "2026-12", current: "2026-10", first: "2026-01", last: "2027-10" });
    const back = [...container.querySelectorAll("a")].find((a) => a.textContent?.startsWith("Back to"));
    expect(back?.textContent).toBe("Back to Oct 2026");
    expect(back?.getAttribute("href")).toBe("/budget?month=2026-10");
  });

  it("hides Back to on the current month", () => {
    render({ month: "2026-10", current: "2026-10", first: "2026-01", last: "2027-10" });
    expect(container.textContent).not.toContain("Back to");
  });

  it("greys out months outside the range and marks the viewed and current months", () => {
    render({ month: "2026-12", current: "2026-10", first: "2026-03", last: "2027-10" });
    const picker = openPicker();

    const cell = (name: string) =>
      [...picker.querySelectorAll<HTMLElement>("a, span[aria-disabled]")].find(
        (el) => el.textContent === name,
      )!;

    expect(cell("Feb").tagName).toBe("SPAN"); // before the range
    expect(cell("Mar").getAttribute("href")).toBe("/budget?month=2026-03");
    expect(cell("Dec").getAttribute("aria-current")).toBe("date");
    expect(cell("Oct").className).toContain("ring-2");
    expect(cell("Dec").className).not.toContain("ring-2");
  });

  it("keeps the ring on the current month when it's also the viewed month", () => {
    render({ month: "2026-10", current: "2026-10", first: "2026-03", last: "2027-10" });
    const picker = openPicker();
    const oct = [...picker.querySelectorAll<HTMLElement>("a")].find((el) => el.textContent === "Oct")!;
    expect(oct.getAttribute("aria-current")).toBe("date");
    expect(oct.className).toContain("ring-2");
    expect(oct.className).toContain("ring-offset-2");
  });
});

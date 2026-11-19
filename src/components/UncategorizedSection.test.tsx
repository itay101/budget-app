/**
 * @jest-environment jsdom
 *
 * The pinned Uncategorized row (#225), rendered the same way as
 * MonthHeader.test.tsx. next/link is swapped for a plain anchor.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UncategorizedSection } from "@/components/UncategorizedSection";

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

const HREF = "/accounts/all?category=__uncategorized__&from=2026-11-01&to=2026-11-30";

function links(): HTMLAnchorElement[] {
  return [...container.querySelectorAll("a")];
}

describe("UncategorizedSection", () => {
  it("renders nothing when the month has no row", () => {
    render(<UncategorizedSection row={null} month="2026-11" currency="USD" />);
    expect(container.querySelector("section")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("links the name and Activity to the month's uncategorized list, and refuses budgeting", () => {
    render(
      <UncategorizedSection
        row={{ activity: -19_750, available: -19_750, count: 2 }}
        month="2026-11"
        currency="USD"
      />,
    );

    expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("Uncategorized");
    expect(links().map((a) => a.getAttribute("href"))).toEqual([HREF, HREF]);
    expect(links()[0].textContent).toBe("Uncategorized");
    expect(links()[1].textContent).toBe("-$19.75");
    expect(container.textContent).toContain("2 need a category");
    expect(container.querySelector("[title='Categorize these transactions instead of budgeting here']")?.textContent).toBe(
      "—",
    );
    expect(container.querySelector("input, button")).toBeNull();
    expect(container.textContent).not.toContain("Add target");
    expect(container.querySelector(".text-danger")?.textContent).toBe("-$19.75");
  });

  it("shows a positive Available in grey, and 'needs' for one transaction", () => {
    render(
      <UncategorizedSection
        row={{ activity: 0, available: 30_000, count: 1 }}
        month="2026-11"
        currency="USD"
      />,
    );

    const available = container.querySelector(".text-neutral-600.font-medium, .font-medium.text-neutral-600");
    expect(available?.textContent).toBe("$30.00");
    expect(container.querySelector(".text-success")).toBeNull();
    expect(container.textContent).toContain("1 needs a category");
  });
});
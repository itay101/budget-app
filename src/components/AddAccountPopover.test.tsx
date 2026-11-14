/**
 * @jest-environment jsdom
 *
 * Covers #195: after "+ Add account" creates an account, the popover
 * navigates to that account's page; a failed create stays put with the
 * error. Rendered the same way as AddFormPopover.test.tsx (react-dom
 * client root + act, no @testing-library/react).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AddAccountPopover } from "@/components/AddAccountPopover";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => push.mockReset());

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(createAccount: (formData: FormData) => Promise<{ id: string }>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<AddAccountPopover createAccount={createAccount} currency="USD" />);
  });
}

async function openAndSubmit(name: string) {
  const trigger = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Add account"),
  )!;
  act(() => trigger.click());
  const form = document.body.querySelector("form")!;
  form.querySelector<HTMLInputElement>('input[name="name"]')!.value = name;
  await act(async () => {
    form.requestSubmit();
  });
}

describe("AddAccountPopover", () => {
  it("navigates to the new account's page once it's created", async () => {
    const createAccount = jest.fn(async () => ({ id: "acc-42" }));
    render(createAccount);

    await openAndSubmit("Checking");

    expect(createAccount).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/accounts/acc-42");
    expect(document.body.querySelector("form")).toBeNull();
  });

  it("stays put and shows the error when creating fails", async () => {
    render(
      jest.fn(async () => {
        throw new Error("Account name is required");
      }),
    );

    await openAndSubmit("Checking");

    expect(push).not.toHaveBeenCalled();
    expect(document.body.querySelector("form")!.textContent).toContain(
      "Account name is required",
    );
  });
});

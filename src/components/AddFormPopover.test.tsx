/**
 * @jest-environment jsdom
 *
 * AddFormPopover is the shared shell behind the "+ Add …" popovers, so it
 * needs a real render (and a real portal to document.body) - hence the
 * jsdom environment override here, same as useServerAction.test.tsx. No
 * @testing-library/react in this repo, so this renders directly via
 * react-dom's client root + act.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AddFormPopover } from "@/components/AddFormPopover";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(onSubmit: (formData: FormData) => Promise<void>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <AddFormPopover
        triggerLabel="Add thing"
        triggerClassName="trigger"
        title="Add a thing"
        submitLabel="Create thing"
        onSubmit={onSubmit}
      >
        <input name="name" />
      </AddFormPopover>,
    );
  });
}

function trigger(): HTMLButtonElement {
  return container.querySelector("button.trigger")!;
}

function panelForm(): HTMLFormElement | null {
  return document.body.querySelector("form");
}

function buttonByText(text: string): HTMLButtonElement {
  return [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  )!;
}

describe("AddFormPopover", () => {
  it("renders only the trigger until clicked, then the titled form with its fields", () => {
    render(jest.fn(async () => {}));

    expect(trigger().textContent).toContain("Add thing");
    expect(panelForm()).toBeNull();

    act(() => trigger().click());

    expect(document.body.textContent).toContain("Add a thing");
    expect(panelForm()?.querySelector('input[name="name"]')).not.toBeNull();
    expect(buttonByText("Create thing").type).toBe("submit");
  });

  it("closes on Cancel without submitting", () => {
    const onSubmit = jest.fn(async () => {});
    render(onSubmit);

    act(() => trigger().click());
    act(() => buttonByText("Cancel").click());

    expect(panelForm()).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the form's data, then resets the form and closes", async () => {
    let seen: FormData | undefined;
    const onSubmit = jest.fn(async (formData: FormData) => {
      seen = formData;
    });
    render(onSubmit);

    act(() => trigger().click());
    const form = panelForm()!;
    const input = form.querySelector<HTMLInputElement>('input[name="name"]')!;
    input.value = "Groceries";
    const resetSpy = jest.spyOn(form, "reset");

    await act(async () => {
      form.requestSubmit();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(seen?.get("name")).toBe("Groceries");
    expect(resetSpy).toHaveBeenCalled();
    expect(panelForm()).toBeNull();
  });

  it("disables the submit button and shows 'Adding…' until the action settles", async () => {
    let resolveAction!: () => void;
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(onSubmit);

    act(() => trigger().click());
    await act(async () => {
      panelForm()!.requestSubmit();
    });

    const submit = panelForm()!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    expect(submit.disabled).toBe(true);
    expect(submit.textContent).toBe("Adding…");

    await act(async () => {
      resolveAction();
    });

    expect(panelForm()).toBeNull();
  });

  it("stays open with the error message when the action throws", async () => {
    const onSubmit = jest.fn(async () => {
      throw new Error("Name already taken");
    });
    render(onSubmit);

    act(() => trigger().click());
    await act(async () => {
      panelForm()!.requestSubmit();
    });

    expect(panelForm()).not.toBeNull();
    expect(panelForm()!.textContent).toContain("Name already taken");
    const submit = panelForm()!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    expect(submit.disabled).toBe(false);
    expect(submit.textContent).toBe("Create thing");
  });
});

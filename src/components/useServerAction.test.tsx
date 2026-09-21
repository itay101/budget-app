/**
 * @jest-environment jsdom
 *
 * useServerAction wraps React hooks (useState/useTransition), so exercising
 * it needs a real render - unlike the rest of the suite (scoped to
 * src/lib's pure logic, see jest.config.js), hence the jsdom environment
 * override here rather than globally. No @testing-library/react in this
 * repo yet, so this renders directly via react-dom's client root + act
 * from react-dom/test-utils.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useServerAction } from "@/components/useServerAction";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function renderHook<R>(callback: () => R): { result: { current: R } } {
  const result = { current: undefined as unknown as R };

  function TestComponent() {
    result.current = callback();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(<TestComponent />);
  });

  return { result };
}

describe("useServerAction", () => {
  it("sets only the given fields on the FormData, never a key for an omitted/undefined value", async () => {
    let seenFormData: FormData | undefined;
    const action = jest.fn(async (formData: FormData) => {
      seenFormData = formData;
      return "ok";
    });
    const { result } = renderHook(() => useServerAction(action));

    await act(async () => {
      await result.current.run({
        transactionId: "t1",
        memo: undefined,
        categoryId: "cat1",
      });
    });

    expect(seenFormData?.get("transactionId")).toBe("t1");
    expect(seenFormData?.get("categoryId")).toBe("cat1");
    expect(seenFormData?.has("memo")).toBe(false);
    expect([...seenFormData!.keys()].sort()).toEqual([
      "categoryId",
      "transactionId",
    ]);
  });

  it("clears error and returns the resolved value on success", async () => {
    const action = jest.fn(async (_formData: FormData) => 42);
    const { result } = renderHook(() => useServerAction(action));

    let returned: number | undefined;
    await act(async () => {
      returned = await result.current.run({ id: "1" });
    });

    expect(returned).toBe(42);
    expect(result.current.error).toBeNull();
  });

  it("sets error and rethrows on failure", async () => {
    const action = jest.fn(async (_formData: FormData) => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useServerAction(action));

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.run({ id: "1" });
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("boom");
    expect(result.current.error).toBe("boom");
  });

  it("falls back to a generic message when the thrown value isn't an Error", async () => {
    const action = jest.fn(async (_formData: FormData) => {
      throw "not an error object";
    });
    const { result } = renderHook(() => useServerAction(action));

    await act(async () => {
      await result.current.run({ id: "1" }).catch(() => {});
    });

    expect(result.current.error).toBe("Something went wrong. Please try again.");
  });
});

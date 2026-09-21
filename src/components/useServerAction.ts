import { useState, useTransition } from "react";

const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : DEFAULT_ERROR_MESSAGE;
}

/**
 * Wraps the "build a FormData from a handful of fields, call a Server
 * Action inside startTransition" pattern reimplemented at ~26 call sites
 * across TransactionsTable/BudgetSwitcherPopover/AccountsTable/
 * CategoryGroupSection/HiddenCategoriesSection/ReconcileButton (#95).
 *
 * `run` sets exactly the given `fields` on a fresh FormData via
 * `formData.set` - it never sets a key for an `undefined`/omitted field,
 * so existing action signatures relying on `formData.get()`/`.has()` for
 * partial-update semantics keep working unchanged. Array fields (e.g.
 * `transactionIds`) must be JSON.stringify'd by the caller before being
 * handed to `run` - this hook only sets string values, it doesn't
 * serialize anything itself.
 *
 * The action runs inside this hook's own `useTransition`, so `pending`
 * reflects it - but `run` itself is a real async function whose returned
 * promise resolves/rejects with the actual `action(formData)` outcome
 * (not merely when the transition settles), so callers can `await run(...)`
 * and branch on the result or a thrown error. On success `error` is
 * cleared; on failure it's set to a formatted message and the error is
 * rethrown, so a caller that needs to react to failure (e.g. not update
 * local state) can still catch it around its own `run(...)` call.
 */
export function useServerAction<T>(
  action: (formData: FormData) => Promise<T>,
): {
  run: (fields: Record<string, string | undefined>) => Promise<T | undefined>;
  pending: boolean;
  error: string | null;
} {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fields: Record<string, string | undefined>): Promise<T | undefined> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      formData.set(key, value);
    }

    return new Promise<T | undefined>((resolve, reject) => {
      startTransition(async () => {
        try {
          const result = await action(formData);
          setError(null);
          resolve(result);
        } catch (err) {
          setError(formatError(err));
          reject(err);
        }
      });
    });
  }

  return { run, pending, error };
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatError } from "@/components/useServerAction";

/**
 * Duck-types Next.js's internal `NEXT_REDIRECT` error thrown by
 * `redirect()` — no public helper for this ships from `next/navigation`.
 * The digest prefix format (`NEXT_REDIRECT;...`) has been stable across
 * Next.js releases; matching on it here lets a genuine failure (the
 * Supabase admin.deleteUser call throwing) still surface as an error
 * below instead of being swallowed as "it redirected".
 */
function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * "Delete account" entry point for `deactivateAccount` (ADR 0005, #107)
 * — deliberately hard to trigger by accident, the same type-to-confirm
 * pattern BudgetSwitcherList uses for deleteBudget, typing the
 * signed-in user's own email since there's no other per-account name to
 * match against.
 *
 * Calls the action directly (`await deactivateAccount()`) instead of via
 * a plain `<form>`, the same way CollaboratorManager's invite form calls
 * `sendInvite`, so the blocking-budget case (`{ error }`, no redirect)
 * can be shown inline. `deactivateAccount` ends with `redirect()` on
 * success, which throws a special Next.js error rather than returning —
 * caught and treated as success here (see `isRedirectError`), with an
 * explicit `router.push` as the actual navigation regardless of whether
 * that thrown redirect is otherwise honored from inside an event
 * handler.
 */
export function DeactivateAccountControl({
  email,
  deactivateAccount,
}: {
  email: string;
  deactivateAccount: () => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Not useTransition: its `pending` doesn't stay true across an `await`
  // inside the transition callback in React 18 (isPending resolves as
  // soon as the callback synchronously returns), which would let a
  // second click fire a concurrent deactivation request while the first
  // is still in flight — see the same note on useServerAction.
  const [pending, setPending] = useState(false);

  function cancel() {
    setConfirming(false);
    setConfirmText("");
    setError(null);
  }

  async function handleDeactivate() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await deactivateAccount();
      if (result?.error) {
        setError(result.error);
        return;
      }
    } catch (err) {
      if (!isRedirectError(err)) {
        setError(formatError(err));
        return;
      }
    } finally {
      setPending(false);
    }
    router.push("/sign-in");
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded px-3 py-1.5 text-left text-small text-neutral-600 hover:bg-danger/10 hover:text-danger"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="space-y-1.5 rounded border border-danger/40 bg-danger/5 p-2">
      <p className="text-small text-neutral-800">
        This permanently deletes your sign-in credentials — you won&apos;t be
        able to sign in again. Type{" "}
        <span className="font-semibold">{email}</span> to confirm.
      </p>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        autoFocus
        placeholder={email}
        aria-label={`Type "${email}" to confirm account deletion`}
        className="w-full rounded border border-neutral-200 px-2 py-1 text-small focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger"
      />
      {error && <p className="text-small text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          className="rounded px-2 py-1 text-small text-neutral-600 hover:bg-neutral-100"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={confirmText !== email || pending}
          onClick={handleDeactivate}
          className="rounded bg-danger px-2 py-1 text-small font-medium text-white hover:bg-danger/90 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  );
}

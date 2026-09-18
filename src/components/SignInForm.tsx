"use client";

import { useState, useTransition } from "react";
import { sendSignInLink, signInWithGoogle } from "@/app/sign-in/actions";

export function SignInForm({ next }: { next?: string }) {
  const [isPending, startTransition] = useTransition();
  const [isGooglePending, startGoogleTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await sendSignInLink(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  // On success signInWithGoogle redirects and never resolves an object —
  // this only ever runs for the "couldn't even start OAuth" failure case.
  function onGoogleSubmit(formData: FormData) {
    setError(null);
    startGoogleTransition(async () => {
      const result = await signInWithGoogle(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  if (sent) {
    return (
      <p className="text-body text-neutral-800">
        Check your email for a sign-in link.
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-300">
      <form action={onSubmit} className="flex flex-col gap-200">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="flex flex-col gap-1">
          <span className="text-small font-medium text-neutral-700">
            Email
          </span>
          <input
            type="email"
            name="email"
            required
            autoFocus
            className="rounded border border-neutral-300 px-3 py-2 text-body"
          />
        </label>
        {error && <p className="text-small text-danger">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-brand px-3 py-2 text-body font-medium text-neutral-0 disabled:opacity-60"
        >
          {isPending ? "Sending…" : "Send sign-in link"}
        </button>
      </form>

      <div className="flex items-center gap-200 text-small text-neutral-500">
        <span className="h-px flex-1 bg-neutral-200" />
        or
        <span className="h-px flex-1 bg-neutral-200" />
      </div>

      <form action={onGoogleSubmit}>
        {next && <input type="hidden" name="next" value={next} />}
        <button
          type="submit"
          disabled={isGooglePending}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-body font-medium text-neutral-800 disabled:opacity-60"
        >
          {isGooglePending ? "Redirecting…" : "Continue with Google"}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { sendSignInLink } from "@/app/sign-in/actions";

export function SignInForm({ next }: { next?: string }) {
  const [isPending, startTransition] = useTransition();
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

  if (sent) {
    return (
      <p className="text-body text-neutral-800">
        Check your email for a sign-in link.
      </p>
    );
  }

  return (
    <form action={onSubmit} className="flex w-full max-w-xs flex-col gap-200">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-neutral-700">Email</span>
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
  );
}

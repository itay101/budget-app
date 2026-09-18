import { SignInForm } from "@/components/SignInForm";

// Invite-only: there is deliberately no signup form anywhere in this app
// (see #56's locked decision). An invited collaborator's very first
// sign-in uses this exact same page/form as anyone else's — Supabase
// doesn't distinguish "new" from "returning" at this step.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-300 p-400">
      <h1 className="text-h2 text-neutral-800">Budget App</h1>
      {error && <p className="text-small text-danger">{error}</p>}
      <SignInForm next={next} />
    </main>
  );
}

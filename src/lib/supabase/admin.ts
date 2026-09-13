import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase client authenticated with the secret service-role key,
 * rather than the anon key — the only kind that can call `auth.admin.*`
 * (`inviteUserByEmail`/`deleteUser`). Used by the invite flow (#73,
 * src/app/budgets/inviteActions.ts) and scripts/bootstrap-first-owner.ts.
 * Server-only: never import this from a Client Component or anything
 * else that ships to the browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

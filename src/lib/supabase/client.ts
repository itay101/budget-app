import { createBrowserClient } from "@supabase/ssr";

/**
 * A Supabase client for use in Client Components. Reads the session from
 * cookies (kept fresh by middleware.ts), never talks to the database
 * directly — this app's data access stays entirely on the server, via
 * Prisma (src/lib/prisma.ts) and server actions.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

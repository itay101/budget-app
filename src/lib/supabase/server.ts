import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * A Supabase client for use in Server Components, Server Actions, and
 * Route Handlers — reads/writes the session via the request's cookies.
 *
 * Server Components can't set cookies (Next.js throws), so `set`/`remove`
 * are no-ops there; that's fine as long as middleware.ts is also
 * refreshing the session on every request, which is the actual mechanism
 * that keeps a session alive across page loads. Server Actions and Route
 * Handlers *can* set cookies, and do.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component — middleware.ts handles the
            // actual session refresh; see this module's doc comment.
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set(name, "", options);
          } catch {
            // Same as above.
          }
        },
      },
    },
  );
}

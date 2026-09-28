/**
 * Sends one request through a Supabase project's HTTP API gateway so the
 * project registers activity.
 *
 * A direct Postgres `SELECT 1` (what /api/cron/keepalive-dev did on its
 * own) doesn't reliably count toward Supabase's 7-day inactivity check:
 * budget-app-dev kept getting "your project is going to be paused"
 * emails despite a daily direct-DB ping. Requests to the project's
 * API (Auth/REST) do count, so the keepalive cron sends one of those too.
 *
 * `/auth/v1/health` is used because it only needs the publishable/anon
 * key (safe to hold server-side, no secrets involved) and returns 200
 * without touching any app data.
 */
export async function pingSupabaseApi(
  projectUrl: string,
  publishableKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const url = `${projectUrl.replace(/\/+$/, "")}/auth/v1/health`;
  const response = await fetchImpl(url, {
    headers: { apikey: publishableKey },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Supabase API keepalive to ${url} failed with HTTP ${response.status}`,
    );
  }
  return response.status;
}

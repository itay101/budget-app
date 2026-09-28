/**
 * Whether a request to one of the /api/cron/* routes may run.
 *
 * When CRON_SECRET is set (Vercel sends it automatically as a bearer token
 * on cron-invoked requests when the env var exists on the project),
 * require it so these endpoints can't be triggered by anyone else. When
 * it isn't set, every request is allowed.
 */
export function isAuthorizedCronRequest(
  request: Request,
  cronSecret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

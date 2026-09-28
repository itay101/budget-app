import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { pingSupabaseApi } from "@/lib/supabaseKeepalive";

// Always run this on request (never prerender/cache it at build time) —
// each cron invocation needs to issue a fresh query against the database.
export const dynamic = "force-dynamic";

/**
 * Vercel Cron only ever invokes routes on the *production* deployment, so
 * the plain `/api/cron/keepalive` route (which queries through the shared
 * Prisma client bound to `DATABASE_URL`) only ever keeps the Supabase
 * project wired to production's `DATABASE_URL` awake — see the comment on
 * that route and the "Keeping the Supabase project awake" section in the
 * README.
 *
 * That leaves the separate dev/preview Supabase project with no traffic
 * at all, so it still crosses Supabase's 7-day inactivity window and
 * triggers "your project will be paused" emails. This route pings that
 * second project directly using its own connection string
 * (`DEV_DATABASE_URL`, set only on production so this daily cron can
 * reach it) instead of the shared `prisma` client.
 *
 * A direct-DB query alone turned out not to be enough — Supabase kept
 * warning about pausing the dev project even with it in place — so when
 * `DEV_SUPABASE_URL` and `DEV_SUPABASE_ANON_KEY` are set this also sends
 * a request through the dev project's HTTP API (see
 * src/lib/supabaseKeepalive.ts), which Supabase does count as activity.
 *
 * Set those vars (and/or `DEV_DATABASE_URL`) in Vercel's production
 * environment to enable each ping. With none of them set, this route is
 * a no-op (so it's safe to leave the cron entry in vercel.json even
 * before they're configured).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const api = await pingDevApi();
  const database = await pingDevDatabase();

  if (!api && !database) {
    return NextResponse.json({
      ok: true,
      skipped:
        "Neither DEV_SUPABASE_URL/DEV_SUPABASE_ANON_KEY nor DEV_DATABASE_URL is set",
    });
  }

  return NextResponse.json({
    ok: true,
    pinged: { api, database },
    pingedAt: new Date().toISOString(),
  });
}

/** Returns whether the ping ran (i.e. its env vars are set). */
async function pingDevApi(): Promise<boolean> {
  const url = process.env.DEV_SUPABASE_URL;
  const anonKey = process.env.DEV_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  await pingSupabaseApi(url, anonKey);
  return true;
}

/** Returns whether the ping ran (i.e. DEV_DATABASE_URL is set). */
async function pingDevDatabase(): Promise<boolean> {
  const devDatabaseUrl = process.env.DEV_DATABASE_URL;
  if (!devDatabaseUrl) return false;

  // Deliberately not the shared `prisma` singleton from "@/lib/prisma" —
  // that one is pinned to `DATABASE_URL` (the production database). A
  // short-lived client is fine here since this route runs at most once a
  // day.
  const devPrisma = new PrismaClient({
    datasources: { db: { url: devDatabaseUrl } },
  });

  try {
    await devPrisma.$queryRaw`SELECT 1`;
  } finally {
    await devPrisma.$disconnect();
  }
  return true;
}

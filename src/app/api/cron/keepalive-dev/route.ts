import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

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
 * Set `DEV_DATABASE_URL` to the dev project's connection string in
 * Vercel's production environment to enable this. If it isn't set, this
 * route is a no-op (so it's safe to leave the cron entry in vercel.json
 * even before that var is configured).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const devDatabaseUrl = process.env.DEV_DATABASE_URL;
  if (!devDatabaseUrl) {
    return NextResponse.json({
      ok: true,
      skipped: "DEV_DATABASE_URL is not set",
    });
  }

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

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}

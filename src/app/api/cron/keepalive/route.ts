import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";

// Always run this on request (never prerender/cache it at build time) —
// each cron invocation needs to issue a fresh query against the database.
export const dynamic = "force-dynamic";

/**
 * Supabase's free tier pauses a project after 7 days with no activity.
 * This route runs on a daily Vercel Cron schedule (see vercel.json) and
 * issues a trivial query so the database always has recent activity and
 * never crosses that inactivity window.
 *
 * Only Vercel Cron may call it when CRON_SECRET is set — see
 * src/lib/cronAuth.ts.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.$queryRaw`SELECT 1`;

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}

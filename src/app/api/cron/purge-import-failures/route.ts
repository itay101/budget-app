import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPORT_FAILURES_BUCKET, purgeExpiredImportFailures } from "@/lib/importFailureReport";

export const dynamic = "force-dynamic";

/**
 * Daily Vercel Cron (see vercel.json): deletes File Import failure files
 * (#194) older than the 30-day retention window from the private
 * `import-failures` bucket. See docs/adr/0013.
 *
 * Only Vercel Cron may call it when CRON_SECRET is set (src/lib/cronAuth.ts).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true, skipped: "not configured" });
  }

  const bucket = createAdminClient().storage.from(IMPORT_FAILURES_BUCKET);
  try {
    const deleted = await purgeExpiredImportFailures(
      {
        list: (prefix) => bucket.list(prefix, { limit: 1000 }),
        remove: (paths) => bucket.remove(paths),
      },
      new Date(),
    );
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * One-time, manually-run bootstrap: creates the very first Supabase Auth
 * user and makes them the owner of every pre-existing Budget.
 *
 * Signup is invite-only (#56) — every ordinary invite is sent by an
 * existing Owner (#73). The very first user in a given environment has
 * no one to invite them, so this script stands in for that one time.
 * Run it once per environment (local dev, the shared preview/dev
 * Supabase project, production) *before* deploying app code that
 * requires `Budget.ownerId` to be set (see #71 and docs/adr/0006) —
 * everything downstream of this script assumes it already ran.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (the secret key, never the anon key —
 * never expose this to the browser) and APP_URL (the environment's own
 * origin, e.g. https://budget-app.vercel.app or a preview URL — no
 * request to derive it from here, unlike inviteActions.ts's ordinary
 * invite flow) in the environment it runs against. Not committed
 * anywhere and not something an AI session has access to; run this
 * yourself:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... APP_URL=https://your-env.example.com npx tsx scripts/bootstrap-first-owner.ts you@example.com
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: tsx scripts/bootstrap-first-owner.ts <email>");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.APP_URL;
  if (!supabaseUrl || !serviceRoleKey || !appUrl) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and APP_URL must all be set",
    );
    process.exit(1);
  }

  // Raw SQL, not the typed Prisma API: schema.prisma declares `ownerId`
  // required (as of the 20260913150000_budget_owner_not_null migration),
  // so Prisma Client's generated types no longer admit `null` as a value
  // to query against — but this script's whole job is operating in the
  // narrow, real window *before* that's true everywhere (a fresh
  // environment, or one where that migration hasn't applied yet), where
  // the column can still genuinely hold nulls at the database level
  // regardless of what the schema says it "should" be.
  const [{ count: existingOwnerCount }] = await prisma.$queryRaw<
    [{ count: bigint }]
  >`SELECT count(*) AS count FROM "Budget" WHERE "ownerId" IS NOT NULL`;
  if (existingOwnerCount > 0) {
    console.error(
      "At least one Budget already has an owner — this script is only for the very first bootstrap. Use the ordinary invite flow instead.",
    );
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Sends a real magic-link invite email — the same primitive the
  // ordinary invite flow (#73) uses, so this first user's sign-in
  // experience isn't a special case. redirectTo matters here: without
  // it, Supabase falls back to the project's dashboard-configured Site
  // URL (defaults to http://localhost:3000) instead of this
  // environment's actual origin, and sends the link straight to `/`
  // rather than /auth/callback, which is the route that actually
  // exchanges the code for a session (see src/app/auth/callback/route.ts).
  const callbackUrl = new URL("/auth/callback", appUrl).toString();
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: callbackUrl },
  );
  if (error || !data.user) {
    console.error(`Failed to invite ${email}:`, error?.message);
    process.exit(1);
  }

  // The mirror trigger (prisma/migrations/20260913120000_add_auth_and_sharing)
  // inserts the matching public."User" row synchronously as part of the
  // same auth.users insert inviteUserByEmail just performed.
  const user = await prisma.user.findUnique({ where: { id: data.user.id } });
  if (!user) {
    console.error(
      `Invited ${email} in Supabase Auth, but no public.User row appeared — check that the mirror trigger from this migration is actually installed.`,
    );
    process.exit(1);
  }

  // Same reason as the count above: raw SQL to query/set a null ownerId
  // that the typed API no longer believes can exist.
  const count = await prisma.$executeRaw`UPDATE "Budget" SET "ownerId" = ${user.id}::uuid WHERE "ownerId" IS NULL`;

  console.log(
    `Invited ${email} (User ${user.id}) and made them owner of ${count} existing Budget(s). They'll get a magic-link email to complete sign-in.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

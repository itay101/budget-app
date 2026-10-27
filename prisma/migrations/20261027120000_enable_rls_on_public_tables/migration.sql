-- Close the Supabase security advisor findings (rls_disabled_in_public,
-- function_search_path_mutable, anon/authenticated_security_definer_
-- function_executable).
--
-- Everything in `public` is exposed through Supabase's Data API
-- (PostgREST), and the anon key ships to the browser for auth. A table
-- without RLS is therefore readable and writable by anyone holding that
-- key. The app itself never goes through the Data API for these tables:
-- Prisma connects as the table owner, which bypasses RLS (no FORCE), so
-- enabling RLS with no anon/authenticated policies denies the API without
-- touching the app.
--
-- RLS on the original tables was switched on by hand in the dashboard,
-- never in a migration, so every table added since shipped without it.
-- This migration covers all of them, idempotently, so a fresh database
-- matches production and new tables have a precedent to follow.
--
-- The local and e2e databases are plain Postgres without Supabase's
-- anon/authenticated/service_role roles, so the role-specific statements
-- are guarded on those roles existing.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    '_prisma_migrations',
    'User',
    'Budget',
    'BudgetMembership',
    'Invite',
    'AuditEntry',
    'Account',
    'CategoryGroup',
    'Category',
    'CategoryMonth',
    'CategoryTarget',
    'CategoryTargetSnooze',
    'Payee',
    'Transaction'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = t AND policyname = 'service_role_all'
       ) THEN
      EXECUTE format(
        'CREATE POLICY service_role_all ON public.%I TO service_role USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END;
$$;

-- Pin search_path so a caller can't shadow the tables these functions
-- touch. The two auth.users mirrors already schema-qualify everything
-- they reference, so they get an empty path; the deactivation guard
-- refers to "Budget"/"BudgetMembership" unqualified, so it gets public.
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.handle_user_email_update() SET search_path = '';
ALTER FUNCTION public.prevent_orphaning_owned_budgets() SET search_path = public;

-- The auth.users mirrors are SECURITY DEFINER trigger functions; nothing
-- should call them over /rest/v1/rpc. EXECUTE is only checked when a
-- trigger is created, not when it fires, so revoking it leaves the
-- on_auth_user_* triggers working.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_user_email_update() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.handle_user_email_update() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.handle_user_email_update() FROM authenticated;
  END IF;
END;
$$;

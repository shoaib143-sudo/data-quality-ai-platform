-- Dedicated read-only PostgREST probe for validating server API keys used by
-- the PostgreSQL Edge connector. Execution is intentionally service_role only.
create or replace function public.verify_dgp_service_role_key()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select true;
$$;

revoke all on function public.verify_dgp_service_role_key() from public;
revoke all on function public.verify_dgp_service_role_key() from anon;
revoke all on function public.verify_dgp_service_role_key() from authenticated;
grant execute on function public.verify_dgp_service_role_key() to service_role;

comment on function public.verify_dgp_service_role_key()
is 'Read-only service-role authentication probe for governed DataNexus backend connectors.';

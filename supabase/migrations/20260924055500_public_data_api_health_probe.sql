-- Purpose-built public Data API health probe for browser-safe publishable keys.
-- Returns a constant only: no user data, catalog data, secrets, or privileged reads.
create or replace function public.public_data_api_health()
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select true;
$$;

revoke all on function public.public_data_api_health() from public;
grant execute on function public.public_data_api_health() to anon, authenticated, service_role;

comment on function public.public_data_api_health() is
  'Zero-data Data API health probe. Safe for publishable-key gateway validation.';

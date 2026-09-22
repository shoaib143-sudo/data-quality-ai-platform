-- Narrow release-control bridge for Cloudflare OBSERVABILITY canary workflows.
-- Supabase opaque secret keys authenticate through apikey but PostgREST does not
-- map them to the service_role database role. These functions therefore expose
-- only bounded release actions while keeping the underlying orchestration RPCs
-- service-role-only.

create or replace function public.get_cloudflare_observability_canary_release_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, orchestration
as $function$
  select orchestration.get_cloudflare_observability_canary_status();
$function$;

create or replace function public.configure_cloudflare_observability_canary_release(
  p_worker_url text,
  p_worker_secret text,
  p_enabled boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, orchestration
as $function$
begin
  perform orchestration.configure_cloudflare_observability_canary(
    p_worker_url,
    p_worker_secret,
    p_enabled
  );
end;
$function$;

revoke all on function public.get_cloudflare_observability_canary_release_status() from public,anon,authenticated;
revoke all on function public.configure_cloudflare_observability_canary_release(text,text,boolean) from public,anon,authenticated;

grant execute on function public.get_cloudflare_observability_canary_release_status() to service_role;
grant execute on function public.configure_cloudflare_observability_canary_release(text,text,boolean) to service_role;

select pg_notify('pgrst','reload schema');

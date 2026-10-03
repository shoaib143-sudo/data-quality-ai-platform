begin;

create table if not exists governance.provider_projections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  provider text not null,
  connection_id text not null,
  canonical_object_id text not null,
  provider_object_id text not null,
  provider_version text,
  last_observed_fingerprint text not null,
  last_observed_at timestamptz not null,
  sync_state text not null check (sync_state in ('IN_SYNC','DRIFTED','MISSING','UNSUPPORTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, provider, connection_id, canonical_object_id),
  unique (project_id, provider, connection_id, provider_object_id)
);

create index if not exists provider_projections_observed_idx
  on governance.provider_projections(project_id, provider, connection_id, last_observed_at desc);

alter table governance.provider_projections enable row level security;
revoke all on governance.provider_projections from public, anon, authenticated;
grant select on governance.provider_projections to service_role;

create or replace function governance.upsert_provider_projection_observations(
  p_project_id uuid,
  p_observations jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_count integer := 0;
  v_provider text;
  v_connection_id text;
  v_canonical_object_id text;
  v_provider_object_id text;
  v_provider_version text;
  v_fingerprint text;
  v_observed_at timestamptz;
  v_sync_state text;
begin
  if p_project_id is null then
    raise exception 'Governance provider projection persistence requires a project.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_observations) <> 'array' then
    raise exception 'Governance provider projection observations must be a JSON array.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_observations)
  loop
    v_provider := lower(btrim(coalesce(v_item->>'provider','')));
    v_connection_id := btrim(coalesce(v_item->>'connection_id',''));
    v_canonical_object_id := btrim(coalesce(v_item->>'canonical_object_id',''));
    v_provider_object_id := btrim(coalesce(v_item->>'provider_object_id',''));
    v_provider_version := nullif(btrim(coalesce(v_item->>'provider_version','')),'');
    v_fingerprint := btrim(coalesce(v_item->>'last_observed_fingerprint',''));
    v_observed_at := nullif(v_item->>'last_observed_at','')::timestamptz;
    v_sync_state := btrim(coalesce(v_item->>'sync_state',''));

    if v_provider = '' or v_connection_id = '' or v_canonical_object_id = '' or v_provider_object_id = ''
       or v_fingerprint = '' or v_observed_at is null
       or v_sync_state not in ('IN_SYNC','DRIFTED','MISSING','UNSUPPORTED') then
      raise exception 'Governance provider projection observation is invalid.' using errcode = '22023';
    end if;

    insert into governance.provider_projections (
      project_id, provider, connection_id, canonical_object_id, provider_object_id,
      provider_version, last_observed_fingerprint, last_observed_at, sync_state, updated_at
    ) values (
      p_project_id, v_provider, v_connection_id, v_canonical_object_id, v_provider_object_id,
      v_provider_version, v_fingerprint, v_observed_at, v_sync_state, now()
    )
    on conflict (project_id, provider, connection_id, canonical_object_id)
    do update set
      provider_object_id = excluded.provider_object_id,
      provider_version = excluded.provider_version,
      last_observed_fingerprint = excluded.last_observed_fingerprint,
      last_observed_at = excluded.last_observed_at,
      sync_state = excluded.sync_state,
      updated_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function governance.upsert_provider_projection_observations(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function governance.upsert_provider_projection_observations(uuid,jsonb)
  to service_role;

do $block$
begin
  if has_table_privilege('authenticated','governance.provider_projections','SELECT')
     or has_table_privilege('authenticated','governance.provider_projections','INSERT')
     or has_table_privilege('authenticated','governance.provider_projections','UPDATE')
     or has_table_privilege('authenticated','governance.provider_projections','DELETE') then
    raise exception 'Governance provider projection table privilege boundary is incorrect.';
  end if;
  if not has_function_privilege('service_role','governance.upsert_provider_projection_observations(uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','governance.upsert_provider_projection_observations(uuid,jsonb)','EXECUTE') then
    raise exception 'Governance provider projection RPC privilege boundary is incorrect.';
  end if;
end;
$block$;

comment on table governance.provider_projections is
  'Durable project-scoped mapping between canonical DataNexus governance identity and provider object identity.';

commit;

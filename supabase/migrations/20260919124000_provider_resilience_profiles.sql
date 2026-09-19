-- Runtime v2 production provider resilience governance.
-- Automatic fallback is allowed only between explicitly approved, governance-equivalent
-- current AI-system versions. Profiles are append-only human-reviewed policy evidence.

create table if not exists governance.ai_provider_resilience_profile_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  ai_system_version_id uuid not null references governance.ai_system_versions(id) on delete restrict,
  fallback_group text not null check (length(btrim(fallback_group)) > 0),
  production_eligible boolean not null default false,
  automatic_fallback_enabled boolean not null default false,
  data_residency_regions text[] not null,
  security_tier integer not null check (security_tier between 0 and 10),
  governance_tier integer not null check (governance_tier between 0 and 10),
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  reviewer_capability text not null default 'policy.approve',
  review_note text not null check (length(btrim(review_note)) > 0),
  created_at timestamptz not null default now(),
  check (cardinality(data_residency_regions) > 0)
);

create index if not exists ai_provider_resilience_profile_project_version_idx
  on governance.ai_provider_resilience_profile_versions(project_id, ai_system_version_id, created_at desc, id desc);
create index if not exists ai_provider_resilience_profile_reviewer_idx
  on governance.ai_provider_resilience_profile_versions(reviewer_user_id);

alter table governance.ai_provider_resilience_profile_versions enable row level security;
drop policy if exists ai_provider_resilience_profile_read on governance.ai_provider_resilience_profile_versions;
create policy ai_provider_resilience_profile_read
  on governance.ai_provider_resilience_profile_versions
  for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on governance.ai_provider_resilience_profile_versions from public, anon, authenticated, service_role;
grant select on governance.ai_provider_resilience_profile_versions to authenticated, service_role;
grant insert on governance.ai_provider_resilience_profile_versions to service_role;

create or replace function governance.reject_ai_provider_resilience_profile_mutation()
returns trigger
language plpgsql
set search_path = 'pg_catalog', 'governance'
as $$
begin
  raise exception 'AI provider resilience profiles are append-only governance evidence';
end;
$$;

revoke all on function governance.reject_ai_provider_resilience_profile_mutation() from public, anon, authenticated, service_role;

drop trigger if exists ai_provider_resilience_profile_immutable on governance.ai_provider_resilience_profile_versions;
create trigger ai_provider_resilience_profile_immutable
before update or delete on governance.ai_provider_resilience_profile_versions
for each row execute function governance.reject_ai_provider_resilience_profile_mutation();

create or replace function governance.publish_ai_provider_resilience_profile(
  p_project_id uuid,
  p_ai_system_version_id uuid,
  p_fallback_group text,
  p_production_eligible boolean,
  p_automatic_fallback_enabled boolean,
  p_data_residency_regions text[],
  p_security_tier integer,
  p_governance_tier integer,
  p_reviewer_user_id uuid,
  p_review_note text
)
returns uuid
language plpgsql
security definer
set search_path = 'pg_catalog', 'governance'
as $$
declare
  v_id uuid := gen_random_uuid();
  v_group text := btrim(coalesce(p_fallback_group, ''));
  v_note text := btrim(coalesce(p_review_note, ''));
  v_regions text[];
begin
  if p_project_id is null or p_ai_system_version_id is null or p_reviewer_user_id is null then
    raise exception 'project, AI system version, and reviewer are required' using errcode = '22023';
  end if;
  if v_group = '' then
    raise exception 'fallback_group is required' using errcode = '22023';
  end if;
  if v_note = '' then
    raise exception 'review_note is required' using errcode = '22023';
  end if;
  if p_security_tier is null or p_security_tier < 0 or p_security_tier > 10
     or p_governance_tier is null or p_governance_tier < 0 or p_governance_tier > 10 then
    raise exception 'security_tier and governance_tier must be between 0 and 10' using errcode = '22023';
  end if;

  select array_agg(region order by region) into v_regions
  from (
    select distinct upper(btrim(value)) as region
    from unnest(coalesce(p_data_residency_regions, '{}'::text[])) value
    where nullif(btrim(value), '') is not null
  ) normalized;

  if coalesce(cardinality(v_regions), 0) = 0 then
    raise exception 'At least one data residency region is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from governance.ai_system_versions v
    where v.id = p_ai_system_version_id
      and v.project_id = p_project_id
  ) then
    raise exception 'AI system version does not belong to the project' using errcode = '23503';
  end if;

  if not governance.has_project_capability(p_project_id, p_reviewer_user_id, 'policy.approve') then
    raise exception 'Reviewer lacks policy.approve' using errcode = '42501';
  end if;

  insert into governance.ai_provider_resilience_profile_versions(
    id, project_id, ai_system_version_id, fallback_group,
    production_eligible, automatic_fallback_enabled, data_residency_regions,
    security_tier, governance_tier, reviewer_user_id, reviewer_capability, review_note
  ) values (
    v_id, p_project_id, p_ai_system_version_id, v_group,
    coalesce(p_production_eligible, false), coalesce(p_automatic_fallback_enabled, false), v_regions,
    p_security_tier, p_governance_tier, p_reviewer_user_id, 'policy.approve', v_note
  );

  insert into governance.audit_events(
    project_id, actor_user_id, actor_type, event_type, entity_type, entity_id, metadata
  ) values (
    p_project_id, p_reviewer_user_id, 'USER',
    'AI_PROVIDER_RESILIENCE_PROFILE_PUBLISHED', 'AI_SYSTEM_VERSION', p_ai_system_version_id,
    jsonb_build_object(
      'profile_id', v_id,
      'fallback_group', v_group,
      'production_eligible', coalesce(p_production_eligible, false),
      'automatic_fallback_enabled', coalesce(p_automatic_fallback_enabled, false),
      'data_residency_regions', v_regions,
      'security_tier', p_security_tier,
      'governance_tier', p_governance_tier,
      'required_capability', 'policy.approve'
    )
  );

  return v_id;
end;
$$;

revoke all on function governance.publish_ai_provider_resilience_profile(
  uuid,uuid,text,boolean,boolean,text[],integer,integer,uuid,text
) from public, anon, authenticated;
grant execute on function governance.publish_ai_provider_resilience_profile(
  uuid,uuid,text,boolean,boolean,text[],integer,integer,uuid,text
) to service_role;

create or replace view governance.ai_provider_resilience_profile_effective
with (security_invoker = true)
as
select distinct on (project_id, ai_system_version_id)
  id,
  project_id,
  ai_system_version_id,
  fallback_group,
  production_eligible,
  automatic_fallback_enabled,
  data_residency_regions,
  security_tier,
  governance_tier,
  reviewer_user_id,
  reviewer_capability,
  review_note,
  created_at
from governance.ai_provider_resilience_profile_versions
order by project_id, ai_system_version_id, created_at desc, id desc;

grant select on governance.ai_provider_resilience_profile_effective to authenticated, service_role;

comment on table governance.ai_provider_resilience_profile_versions is
  'Append-only human-reviewed provider fallback equivalence profiles. Automatic fallback remains disabled unless both exact AI-system versions are explicitly production eligible and fallback enabled.';
comment on view governance.ai_provider_resilience_profile_effective is
  'Latest human-reviewed resilience profile for each exact AI-system version.';

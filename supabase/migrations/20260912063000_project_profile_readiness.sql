-- Derived project-scoped source-to-profiling readiness.
-- This verifier does not mutate source, dataset, discovery, or profiling lifecycle authority.

create or replace function catalog.verify_project_profile_readiness(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with latest_version as (
    select distinct on (dv.dataset_id)
      dv.dataset_id,
      dv.id as dataset_version_id,
      dv.version_number,
      dv.source_uri,
      dv.content_hash,
      dv.schema_hash
    from catalog.dataset_versions dv
    join catalog.datasets d on d.id = dv.dataset_id
    where d.project_id = p_project_id
    order by dv.dataset_id, dv.version_number desc, dv.created_at desc, dv.id desc
  ),
  active_scope as (
    select distinct on (s.source_id)
      s.source_id,
      s.id as scope_id,
      s.current_version_id,
      sv.frozen_at
    from catalog.source_scopes s
    left join catalog.source_scope_versions sv on sv.id = s.current_version_id
    where s.project_id = p_project_id
      and s.status = 'ACTIVE'
      and s.current_version_id is not null
    order by s.source_id, s.updated_at desc, s.id desc
  ),
  latest_manifest as (
    select distinct on (m.source_id)
      m.source_id,
      m.discovery_run_id,
      m.complete,
      m.truncated,
      m.failed_item_count,
      m.completed_at
    from catalog.discovery_manifests m
    where m.project_id = p_project_id
    order by m.source_id, m.completed_at desc nulls last, m.created_at desc, m.id desc
  ),
  evidence as (
    select
      d.id as dataset_id,
      d.data_source_id as source_id,
      ds.source_type,
      d.status::text as dataset_status,
      ds.status as source_status,
      sor.operational_state,
      lv.dataset_version_id,
      aes.id as execution_source_id,
      sc.scope_id,
      sc.current_version_id as scope_version_id,
      sc.frozen_at as scope_frozen_at,
      lm.discovery_run_id,
      lm.complete as manifest_complete,
      lm.truncated as manifest_truncated,
      coalesce(lm.failed_item_count,0) as manifest_failed_item_count,
      case when d.status::text = 'ACTIVE' then true else false end as dataset_active,
      case when ds.status = 'ACTIVE' then true else false end as source_active,
      case when sor.operational_state = 'OBSERVED_READY' then true else false end as source_observed_ready,
      case when sc.scope_id is not null and sc.current_version_id is not null and sc.frozen_at is not null then true else false end as governed_scope_ready,
      case when lv.dataset_version_id is not null and aes.id is not null then true else false end as execution_binding_ready,
      case
        when ds.source_type = 'JDBC'
          then coalesce(lm.complete,false) and not coalesce(lm.truncated,true) and coalesce(lm.failed_item_count,0)=0
        else true
      end as discovery_evidence_ready
    from catalog.datasets d
    join catalog.data_sources ds on ds.id = d.data_source_id and ds.project_id = d.project_id
    left join catalog.source_operational_readiness sor on sor.source_id = ds.id and sor.project_id = d.project_id
    left join latest_version lv on lv.dataset_id = d.id
    left join profiling.dataset_execution_sources aes on aes.dataset_version_id = lv.dataset_version_id and aes.active = true
    left join active_scope sc on sc.source_id = ds.id
    left join latest_manifest lm on lm.source_id = ds.id
    where d.project_id = p_project_id
  ),
  classified as (
    select *,
      (dataset_active and source_active and source_observed_ready and governed_scope_ready and execution_binding_ready and discovery_evidence_ready) as profiling_ready,
      jsonb_strip_nulls(jsonb_build_object(
        'DATASET_NOT_ACTIVE', case when not dataset_active then true end,
        'SOURCE_NOT_ACTIVE', case when not source_active then true end,
        'SOURCE_NOT_OBSERVED_READY', case when not source_observed_ready then true end,
        'GOVERNED_SCOPE_NOT_READY', case when not governed_scope_ready then true end,
        'EXECUTION_SOURCE_NOT_BOUND', case when not execution_binding_ready then true end,
        'DISCOVERY_EVIDENCE_INCOMPLETE', case when not discovery_evidence_ready then true end
      )) as blockers
    from evidence
  )
  select jsonb_build_object(
    'valid', count(*) filter (where profiling_ready = false) = 0,
    'state', case
      when count(*) filter (where profiling_ready = false) = 0 then 'PROJECT_PROFILE_READINESS_GOVERNED'
      else 'PROJECT_PROFILE_READINESS_BLOCKED'
    end,
    'project_id', p_project_id,
    'authority_semantics', 'DERIVED_READINESS_DOES_NOT_MUTATE_SOURCE_OR_PROFILING_LIFECYCLE',
    'datasets_assessed', count(*),
    'profiling_ready', count(*) filter (where profiling_ready),
    'blocked', count(*) filter (where profiling_ready = false),
    'blocker_counts', jsonb_build_object(
      'DATASET_NOT_ACTIVE', count(*) filter (where not dataset_active),
      'SOURCE_NOT_ACTIVE', count(*) filter (where not source_active),
      'SOURCE_NOT_OBSERVED_READY', count(*) filter (where not source_observed_ready),
      'GOVERNED_SCOPE_NOT_READY', count(*) filter (where not governed_scope_ready),
      'EXECUTION_SOURCE_NOT_BOUND', count(*) filter (where not execution_binding_ready),
      'DISCOVERY_EVIDENCE_INCOMPLETE', count(*) filter (where not discovery_evidence_ready)
    ),
    'datasets', coalesce(jsonb_agg(jsonb_build_object(
      'dataset_id', dataset_id,
      'source_id', source_id,
      'source_type', source_type,
      'profiling_ready', profiling_ready,
      'blockers', blockers,
      'dataset_version_id', dataset_version_id,
      'execution_source_id', execution_source_id,
      'scope_id', scope_id,
      'scope_version_id', scope_version_id,
      'discovery_run_id', discovery_run_id
    ) order by dataset_id), '[]'::jsonb)
  )
  from classified;
$$;

comment on function catalog.verify_project_profile_readiness(uuid) is
  'Derives dataset profiling readiness from source lifecycle, observed discovery evidence, frozen governed scope, latest version, and active execution binding without mutating lifecycle authority.';

revoke all on function catalog.verify_project_profile_readiness(uuid) from public, anon;
grant execute on function catalog.verify_project_profile_readiness(uuid) to authenticated, service_role;

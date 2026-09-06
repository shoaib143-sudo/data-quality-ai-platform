-- Govern source operational readiness as a derived evidence state.
--
-- catalog.data_sources.status remains the configured lifecycle state. This projection
-- deliberately derives observation readiness from discovery evidence instead of
-- rewriting source lifecycle state or inventing source health.

create or replace view catalog.source_operational_readiness
with (security_invoker = true)
as
with latest_run as (
  select distinct on (dr.source_id)
    dr.source_id,
    dr.id as latest_run_id,
    dr.status as latest_run_status,
    dr.started_at as latest_run_started_at,
    dr.completed_at as latest_run_completed_at,
    dr.assets_discovered as latest_assets_discovered,
    dr.objects_observed as latest_objects_observed,
    dr.catalog_revision_id as latest_catalog_revision_id,
    dr.error_message as latest_error_message
  from catalog.discovery_runs dr
  order by dr.source_id, dr.started_at desc, dr.id desc
), asset_evidence as (
  select
    da.source_id,
    count(*) filter (where da.is_current) as current_assets,
    count(*) as total_asset_versions
  from catalog.discovered_assets da
  group by da.source_id
), evidence as (
  select
    ds.id as source_id,
    ds.project_id,
    ds.source_type,
    ds.name as source_name,
    ds.status as lifecycle_status,
    coalesce(a.current_assets, 0)::bigint as current_assets,
    coalesce(a.total_asset_versions, 0)::bigint as total_asset_versions,
    lr.latest_run_id,
    lr.latest_run_status,
    lr.latest_run_started_at,
    lr.latest_run_completed_at,
    lr.latest_assets_discovered,
    lr.latest_objects_observed,
    lr.latest_catalog_revision_id,
    lr.latest_error_message
  from catalog.data_sources ds
  left join latest_run lr on lr.source_id = ds.id
  left join asset_evidence a on a.source_id = ds.id
)
select
  e.source_id,
  e.project_id,
  e.source_type,
  e.source_name,
  e.lifecycle_status,
  case
    when e.latest_run_status = 'RUNNING' then 'DISCOVERY_IN_PROGRESS'
    when e.latest_run_status = 'FAILED' then 'LAST_DISCOVERY_FAILED'
    when e.latest_run_status = 'COMPLETED' and e.current_assets > 0 then 'OBSERVED_READY'
    when e.latest_run_status = 'COMPLETED' and e.current_assets = 0 then 'OBSERVED_EMPTY'
    when e.latest_run_id is null and e.current_assets = 0 then 'UNOBSERVED'
    else 'EVIDENCE_INCONSISTENT'
  end::text as operational_state,
  (e.latest_run_status = 'COMPLETED' or e.current_assets > 0) as has_observation_evidence,
  e.current_assets,
  e.total_asset_versions,
  e.latest_run_id,
  e.latest_run_status,
  e.latest_run_started_at,
  e.latest_run_completed_at,
  e.latest_assets_discovered,
  e.latest_objects_observed,
  e.latest_catalog_revision_id,
  e.latest_error_message,
  case
    when e.latest_run_status = 'RUNNING' then 'Latest discovery run is still in progress.'
    when e.latest_run_status = 'FAILED' then 'Latest discovery run failed; source lifecycle state is unchanged.'
    when e.latest_run_status = 'COMPLETED' and e.current_assets > 0 then 'Completed discovery has current physical metadata evidence.'
    when e.latest_run_status = 'COMPLETED' and e.current_assets = 0 then 'Discovery completed without current physical assets.'
    when e.latest_run_id is null and e.current_assets = 0 then 'No discovery run or current physical metadata has been observed.'
    else 'Discovery-run and current-asset evidence are inconsistent.'
  end::text as evidence_reason
from evidence e;

comment on view catalog.source_operational_readiness is
  'Security-invoker projection separating configured source lifecycle status from discovery-backed operational evidence state.';

revoke all on table catalog.source_operational_readiness from public, anon;
revoke insert, update, delete, truncate, references, trigger on table catalog.source_operational_readiness from authenticated, service_role;
grant select on table catalog.source_operational_readiness to authenticated, service_role;

create or replace function catalog.verify_source_operational_readiness()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with readiness as (
    select * from catalog.source_operational_readiness
  ), counts as (
    select
      count(*)::bigint as total_sources,
      count(*) filter (where operational_state = 'UNOBSERVED')::bigint as unobserved,
      count(*) filter (where operational_state = 'DISCOVERY_IN_PROGRESS')::bigint as discovery_in_progress,
      count(*) filter (where operational_state = 'LAST_DISCOVERY_FAILED')::bigint as last_discovery_failed,
      count(*) filter (where operational_state = 'OBSERVED_EMPTY')::bigint as observed_empty,
      count(*) filter (where operational_state = 'OBSERVED_READY')::bigint as observed_ready,
      count(*) filter (where operational_state = 'EVIDENCE_INCONSISTENT')::bigint as evidence_inconsistent,
      count(*) filter (where operational_state not in (
        'UNOBSERVED','DISCOVERY_IN_PROGRESS','LAST_DISCOVERY_FAILED','OBSERVED_EMPTY','OBSERVED_READY','EVIDENCE_INCONSISTENT'
      ))::bigint as unknown_state_count,
      count(*) filter (where operational_state = 'OBSERVED_READY' and current_assets <= 0)::bigint as ready_without_assets,
      count(*) filter (where operational_state = 'UNOBSERVED' and (latest_run_id is not null or current_assets > 0))::bigint as unobserved_with_evidence
    from readiness
  )
  select jsonb_build_object(
    'valid', (
      c.unknown_state_count = 0
      and c.ready_without_assets = 0
      and c.unobserved_with_evidence = 0
      and c.evidence_inconsistent = 0
    ),
    'state', case
      when c.unknown_state_count = 0
       and c.ready_without_assets = 0
       and c.unobserved_with_evidence = 0
       and c.evidence_inconsistent = 0
      then 'SOURCE_OPERATIONAL_READINESS_GOVERNED'
      else 'SOURCE_OPERATIONAL_READINESS_EVIDENCE_INVALID'
    end,
    'authority_semantics', 'DERIVED_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_LIFECYCLE',
    'total_sources', c.total_sources,
    'states', jsonb_build_object(
      'UNOBSERVED', c.unobserved,
      'DISCOVERY_IN_PROGRESS', c.discovery_in_progress,
      'LAST_DISCOVERY_FAILED', c.last_discovery_failed,
      'OBSERVED_EMPTY', c.observed_empty,
      'OBSERVED_READY', c.observed_ready,
      'EVIDENCE_INCONSISTENT', c.evidence_inconsistent
    ),
    'violations', jsonb_build_object(
      'unknown_state_count', c.unknown_state_count,
      'ready_without_assets', c.ready_without_assets,
      'unobserved_with_evidence', c.unobserved_with_evidence,
      'evidence_inconsistent', c.evidence_inconsistent
    )
  )
  from counts c;
$$;

comment on function catalog.verify_source_operational_readiness() is
  'Verifies the derived source operational-readiness evidence contract without changing source lifecycle authority.';

revoke all on function catalog.verify_source_operational_readiness() from public, anon;
grant execute on function catalog.verify_source_operational_readiness() to authenticated, service_role;

-- Add an additive project-scoped source operational-readiness verifier.
--
-- The existing no-argument verifier remains the database-global operational posture.
-- This function scopes the same derived evidence contract to one project without
-- mutating catalog.data_sources.status or changing lifecycle authority.

create or replace function catalog.verify_project_source_operational_readiness(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with readiness as (
    select *
    from catalog.source_operational_readiness
    where project_id = p_project_id
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
      then 'PROJECT_SOURCE_OPERATIONAL_READINESS_GOVERNED'
      else 'PROJECT_SOURCE_OPERATIONAL_READINESS_EVIDENCE_INVALID'
    end,
    'project_id', p_project_id,
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

comment on function catalog.verify_project_source_operational_readiness(uuid) is
  'Verifies the derived source operational-readiness evidence contract for one project without changing source lifecycle authority. The no-argument verifier remains the database-global posture.';

revoke all on function catalog.verify_project_source_operational_readiness(uuid) from public, anon;
grant execute on function catalog.verify_project_source_operational_readiness(uuid) to authenticated, service_role;

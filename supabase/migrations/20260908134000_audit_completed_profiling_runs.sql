-- Profiling completion is a governance-relevant lifecycle transition and must be
-- represented in the tamper-evident audit chain. Keep orchestration emission and
-- contract evaluation in the same completion trigger, then append one audit event.

create or replace function governance.on_profile_run_completed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, governance, profiling, catalog, orchestration
as $$
declare
  v_dataset uuid;
  v_project uuid;
begin
  if new.status = 'COMPLETED' and old.status is distinct from new.status then
    select d.id, d.project_id
      into v_dataset, v_project
      from catalog.dataset_versions dv
      join catalog.datasets d on d.id = dv.dataset_id
     where dv.id = new.dataset_version_id;

    if v_project is not null then
      perform orchestration.emit_event(
        v_project,
        'PROFILE_COMPLETED',
        'PROFILE_RUN',
        new.id,
        'PROFILE_COMPLETED:' || new.id::text,
        jsonb_build_object(
          'profile_run_id', new.id,
          'dataset_version_id', new.dataset_version_id,
          'dataset_id', v_dataset
        )
      );

      perform governance.evaluate_data_contract(new.id);

      insert into governance.audit_events(
        project_id,
        actor_user_id,
        actor_type,
        event_type,
        entity_type,
        entity_id,
        correlation_id,
        metadata
      ) values (
        v_project,
        null,
        'SYSTEM',
        'PROFILING_RUN_COMPLETED',
        'PROFILE_RUN',
        new.id,
        new.agent_run_id,
        jsonb_build_object(
          'dataset_id', v_dataset,
          'dataset_version_id', new.dataset_version_id,
          'agent_run_id', new.agent_run_id,
          'row_count', new.row_count,
          'column_count', new.column_count,
          'duplicate_row_count', new.duplicate_row_count,
          'sampling_mode', new.sampling_mode,
          'sampling_size', new.sampling_size,
          'profile_signature', new.profile_signature,
          'execution_mode', coalesce(new.summary ->> 'execution_mode', 'EXECUTED'),
          'quality_score_present', exists(
            select 1 from profiling.data_quality_scores qs where qs.profile_run_id = new.id
          ),
          'metric_count', (
            select count(*) from profiling.profile_metrics pm where pm.profile_run_id = new.id
          ),
          'finding_count', (
            select count(*) from profiling.profile_findings pf where pf.profile_run_id = new.id
          )
        )
      );
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function governance.on_profile_run_completed() from public;
revoke execute on function governance.on_profile_run_completed() from anon;
revoke execute on function governance.on_profile_run_completed() from authenticated;

-- Backfill completed runs that predate the audit append. This is intentionally
-- idempotent and uses the same audit_events insert path so the v3 hash-chain trigger
-- computes previous_hash, event_hash and chain_sequence.
insert into governance.audit_events(
  project_id,
  actor_user_id,
  actor_type,
  event_type,
  entity_type,
  entity_id,
  correlation_id,
  metadata
)
select
  d.project_id,
  null,
  'SYSTEM',
  'PROFILING_RUN_COMPLETED',
  'PROFILE_RUN',
  pr.id,
  pr.agent_run_id,
  jsonb_build_object(
    'dataset_id', d.id,
    'dataset_version_id', pr.dataset_version_id,
    'agent_run_id', pr.agent_run_id,
    'row_count', pr.row_count,
    'column_count', pr.column_count,
    'duplicate_row_count', pr.duplicate_row_count,
    'sampling_mode', pr.sampling_mode,
    'sampling_size', pr.sampling_size,
    'profile_signature', pr.profile_signature,
    'execution_mode', coalesce(pr.summary ->> 'execution_mode', 'EXECUTED'),
    'quality_score_present', exists(
      select 1 from profiling.data_quality_scores qs where qs.profile_run_id = pr.id
    ),
    'metric_count', (
      select count(*) from profiling.profile_metrics pm where pm.profile_run_id = pr.id
    ),
    'finding_count', (
      select count(*) from profiling.profile_findings pf where pf.profile_run_id = pr.id
    ),
    'backfilled', true
  )
from profiling.profile_runs pr
join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
join catalog.datasets d on d.id = dv.dataset_id
where pr.status = 'COMPLETED'
  and not exists (
    select 1
      from governance.audit_events ae
     where ae.project_id is not distinct from d.project_id
       and ae.event_type = 'PROFILING_RUN_COMPLETED'
       and ae.entity_type = 'PROFILE_RUN'
       and ae.entity_id = pr.id
  );

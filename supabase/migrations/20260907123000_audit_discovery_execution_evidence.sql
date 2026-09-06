create or replace function catalog.audit_discovery_run_execution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, governance
as $$
declare
  v_event_type text;
begin
  if new.status = 'RUNNING'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    v_event_type := 'METADATA_DISCOVERY_EXECUTION_STARTED';
  elsif tg_op = 'UPDATE'
        and old.status is distinct from new.status
        and new.status = 'COMPLETED' then
    v_event_type := 'METADATA_DISCOVERY_EXECUTION_SUCCEEDED';
  elsif tg_op = 'UPDATE'
        and old.status is distinct from new.status
        and new.status = 'INCOMPLETE' then
    v_event_type := 'METADATA_DISCOVERY_EXECUTION_INCOMPLETE';
  elsif tg_op = 'UPDATE'
        and old.status is distinct from new.status
        and new.status = 'FAILED' then
    v_event_type := 'METADATA_DISCOVERY_EXECUTION_FAILED';
  else
    return new;
  end if;

  insert into governance.audit_events (
    project_id,
    actor_user_id,
    actor_type,
    event_type,
    entity_type,
    entity_id,
    correlation_id,
    metadata
  ) values (
    new.project_id,
    null,
    'SYSTEM',
    v_event_type,
    'DATA_SOURCE',
    new.source_id,
    new.id,
    jsonb_strip_nulls(jsonb_build_object(
      'discovery_run_id', new.id,
      'durable_job_id', new.durable_job_id,
      'catalog_revision_id', new.catalog_revision_id,
      'scope_id', new.scope_id,
      'scope_version_id', new.scope_version_id,
      'status', new.status,
      'objects_observed', new.objects_observed,
      'objects_added', new.objects_added,
      'objects_changed', new.objects_changed,
      'objects_missing', new.objects_missing,
      'objects_removed', new.objects_removed,
      'objects_unchanged', new.objects_unchanged,
      'consistency_mode', new.consistency_mode,
      'error_message', case when new.status in ('FAILED', 'INCOMPLETE') then new.error_message else null end,
      'authority_semantic', 'DISCOVERY_EXECUTION_EVIDENCE_DOES_NOT_MUTATE_SOURCE_LIFECYCLE'
    ))
  );

  return new;
end;
$$;

revoke all on function catalog.audit_discovery_run_execution() from public;
revoke all on function catalog.audit_discovery_run_execution() from anon;
revoke all on function catalog.audit_discovery_run_execution() from authenticated;

comment on function catalog.audit_discovery_run_execution() is
  'Emits SYSTEM audit evidence for actual discovery execution state transitions. It does not mutate source lifecycle or imply human approval.';

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'catalog.discovery_runs'::regclass
      and tgname = 'discovery_runs_execution_audit_trg'
      and not tgisinternal
  ) then
    create trigger discovery_runs_execution_audit_trg
      after insert or update of status
      on catalog.discovery_runs
      for each row
      execute function catalog.audit_discovery_run_execution();
  end if;
end;
$$;

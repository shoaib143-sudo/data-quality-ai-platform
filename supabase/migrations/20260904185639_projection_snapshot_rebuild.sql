create or replace function orchestration.rebuild_projection_snapshot(p_project_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason,''));
  v_removed bigint := 0;
  v_seed jsonb;
  v_now timestamptz := now();
begin
  if length(v_reason) < 8 then
    raise exception 'Rebuild reason must contain at least 8 characters';
  end if;
  if not exists (select 1 from app.projects where id=p_project_id) then
    raise exception 'Project % was not found', p_project_id;
  end if;

  delete from orchestration.projection_outbox
   where project_id=p_project_id
     and operation='REBUILD';
  get diagnostics v_removed = row_count;

  delete from orchestration.projection_reconciliation_runs
   where project_id=p_project_id
     and provider_key='projection_outbox'
     and projection_name='initial_projection_seed_v1';

  v_seed := orchestration.seed_initial_projection(p_project_id);

  insert into orchestration.projection_reconciliation_runs(
    project_id,provider_key,projection_name,status,started_at,completed_at,details
  ) values (
    p_project_id,'projection_outbox','authoritative_snapshot_rebuild_v1','PASSED',v_now,now(),
    jsonb_build_object(
      'reason',v_reason,
      'removedPriorSnapshotEvents',v_removed,
      'seedResult',v_seed,
      'semantics','fresh_authoritative_snapshot_appended; reset target consumer explicitly to consume snapshot'
    )
  );

  return jsonb_build_object(
    'projectId',p_project_id,
    'status','REBUILT',
    'reason',v_reason,
    'removedPriorSnapshotEvents',v_removed,
    'seed',v_seed
  );
end;
$$;

revoke all on function orchestration.rebuild_projection_snapshot(uuid,text) from public;
revoke all on function orchestration.rebuild_projection_snapshot(uuid,text) from anon;
revoke all on function orchestration.rebuild_projection_snapshot(uuid,text) from authenticated;
grant execute on function orchestration.rebuild_projection_snapshot(uuid,text) to service_role;

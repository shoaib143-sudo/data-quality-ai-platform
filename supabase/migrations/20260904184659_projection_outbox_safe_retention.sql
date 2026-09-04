create index if not exists projection_outbox_created_sequence_idx
  on orchestration.projection_outbox(created_at, sequence_id);

create or replace function orchestration.prune_projection_outbox(
  p_retention_days integer default 30,
  p_batch_size integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint := 0;
  v_min_sequence bigint;
  v_max_sequence bigint;
begin
  if p_retention_days < 7 or p_retention_days > 3650 then
    raise exception 'p_retention_days must be between 7 and 3650';
  end if;
  if p_batch_size < 100 or p_batch_size > 50000 then
    raise exception 'p_batch_size must be between 100 and 50000';
  end if;

  with candidates as (
    select o.sequence_id
    from orchestration.projection_outbox o
    where o.created_at < now() - make_interval(days => p_retention_days)
      and exists (
        select 1
        from orchestration.projection_checkpoints c
        where c.project_id = o.project_id
      )
      and not exists (
        select 1
        from orchestration.projection_checkpoints c
        where c.project_id = o.project_id
          and (
            c.last_checkpoint is null
            or c.last_checkpoint !~ '^[0-9]+$'
            or c.last_checkpoint::bigint < o.sequence_id
          )
      )
    order by o.sequence_id
    limit p_batch_size
    for update skip locked
  ), deleted as (
    delete from orchestration.projection_outbox o
    using candidates c
    where o.sequence_id = c.sequence_id
    returning o.sequence_id
  )
  select count(*), min(sequence_id), max(sequence_id)
    into v_deleted, v_min_sequence, v_max_sequence
  from deleted;

  return jsonb_build_object(
    'deleted', coalesce(v_deleted, 0),
    'minSequence', v_min_sequence,
    'maxSequence', v_max_sequence,
    'retentionDays', p_retention_days,
    'batchSize', p_batch_size,
    'safety', 'consumed_by_all_registered_project_consumers'
  );
end;
$$;

revoke all on function orchestration.prune_projection_outbox(integer, integer) from public;
revoke all on function orchestration.prune_projection_outbox(integer, integer) from anon;
revoke all on function orchestration.prune_projection_outbox(integer, integer) from authenticated;
grant execute on function orchestration.prune_projection_outbox(integer, integer) to service_role;

select cron.schedule(
  'dgp-projection-outbox-retention',
  '20 3 * * *',
  'select orchestration.prune_projection_outbox(30, 5000);'
)
where not exists (
  select 1 from cron.job where jobname = 'dgp-projection-outbox-retention'
);

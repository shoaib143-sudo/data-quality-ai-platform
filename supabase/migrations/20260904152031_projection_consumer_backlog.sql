create or replace function orchestration.list_projection_backlog(
  p_consumer_key text,
  p_limit integer default 20
)
returns table (
  project_id uuid,
  organization_id uuid,
  pending_events bigint,
  earliest_sequence bigint,
  latest_sequence bigint
)
language sql
security definer
set search_path = ''
as $$
  with checkpoints as (
    select
      c.project_id,
      case
        when c.last_checkpoint ~ '^[0-9]+$' then c.last_checkpoint::bigint
        else 0
      end as last_sequence
    from orchestration.projection_checkpoints c
    where c.consumer_key = p_consumer_key
  ), pending as (
    select
      o.project_id,
      count(*) as pending_events,
      min(o.sequence_id) as earliest_sequence,
      max(o.sequence_id) as latest_sequence
    from orchestration.projection_outbox o
    left join checkpoints c on c.project_id = o.project_id
    where o.sequence_id > coalesce(c.last_sequence, 0)
    group by o.project_id
  )
  select
    pending.project_id,
    projects.organization_id,
    pending.pending_events,
    pending.earliest_sequence,
    pending.latest_sequence
  from pending
  join app.projects projects on projects.id = pending.project_id
  order by pending.earliest_sequence
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function orchestration.list_projection_backlog(text, integer) from public, anon, authenticated;
grant execute on function orchestration.list_projection_backlog(text, integer) to service_role;

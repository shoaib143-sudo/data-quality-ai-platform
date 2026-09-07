create table if not exists orchestration.source_concurrency_state (
  project_id uuid not null references app.projects(id) on delete cascade,
  source_key text not null,
  current_limit integer not null default 2 check (current_limit >= 1),
  min_limit integer not null default 1 check (min_limit >= 1),
  max_limit integer not null default 4 check (max_limit >= 1),
  success_streak integer not null default 0 check (success_streak >= 0),
  failure_streak integer not null default 0 check (failure_streak >= 0),
  last_signal text not null default 'INITIAL' check (last_signal in ('INITIAL','CLEAN','ADVERSE')),
  last_signal_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (project_id, source_key),
  constraint source_concurrency_limits_valid check (min_limit <= current_limit and current_limit <= max_limit)
);

alter table orchestration.source_concurrency_state enable row level security;
revoke all on table orchestration.source_concurrency_state from public, anon, authenticated;

comment on table orchestration.source_concurrency_state is
  'Adaptive scheduler control state keyed by stable source identity. This table controls execution concurrency only; it is not governance authority or source metadata.';

create or replace function orchestration.record_source_concurrency_signal(
  p_project_id uuid,
  p_source_key text,
  p_signal text,
  p_initial_limit integer default 2,
  p_max_limit integer default 4
)
returns orchestration.source_concurrency_state
language plpgsql
security definer
set search_path to 'pg_catalog', 'orchestration'
as $$
declare
  v_signal text := upper(coalesce(nullif(trim(p_signal), ''), ''));
  v_initial integer := greatest(1, least(coalesce(p_initial_limit, 2), 16));
  v_max integer := greatest(1, least(coalesce(p_max_limit, 4), 16));
  v_state orchestration.source_concurrency_state;
begin
  if p_project_id is null then
    raise exception 'project_id is required';
  end if;
  if nullif(trim(coalesce(p_source_key, '')), '') is null then
    raise exception 'source_key is required';
  end if;
  if v_signal not in ('CLEAN','ADVERSE') then
    raise exception 'Unsupported source concurrency signal: %', p_signal;
  end if;

  v_initial := least(v_initial, v_max);

  insert into orchestration.source_concurrency_state(
    project_id, source_key, current_limit, min_limit, max_limit,
    success_streak, failure_streak, last_signal, last_signal_at, updated_at
  ) values (
    p_project_id, p_source_key, v_initial, 1, v_max,
    0, 0, 'INITIAL', null, now()
  )
  on conflict (project_id, source_key) do update
    set max_limit = greatest(orchestration.source_concurrency_state.min_limit, excluded.max_limit),
        current_limit = least(orchestration.source_concurrency_state.current_limit, greatest(orchestration.source_concurrency_state.min_limit, excluded.max_limit)),
        updated_at = now()
  returning * into v_state;

  if v_signal = 'ADVERSE' then
    update orchestration.source_concurrency_state
       set current_limit = greatest(min_limit, floor(current_limit / 2.0)::integer),
           success_streak = 0,
           failure_streak = failure_streak + 1,
           last_signal = 'ADVERSE',
           last_signal_at = now(),
           updated_at = now()
     where project_id = p_project_id and source_key = p_source_key
    returning * into v_state;
  else
    update orchestration.source_concurrency_state
       set current_limit = case
             when success_streak + 1 >= 4 then least(max_limit, current_limit + 1)
             else current_limit
           end,
           success_streak = case when success_streak + 1 >= 4 then 0 else success_streak + 1 end,
           failure_streak = 0,
           last_signal = 'CLEAN',
           last_signal_at = now(),
           updated_at = now()
     where project_id = p_project_id and source_key = p_source_key
    returning * into v_state;
  end if;

  insert into orchestration.platform_telemetry(project_id, metric_key, numeric_value, dimensions)
  values (
    p_project_id,
    'planner.source_concurrency_limit',
    v_state.current_limit,
    jsonb_build_object(
      'source_key', p_source_key,
      'signal', v_signal,
      'success_streak', v_state.success_streak,
      'failure_streak', v_state.failure_streak,
      'min_limit', v_state.min_limit,
      'max_limit', v_state.max_limit,
      'controller', 'AIMD'
    )
  );

  return v_state;
end;
$$;

revoke all on function orchestration.record_source_concurrency_signal(uuid,text,text,integer,integer) from public, anon, authenticated;
grant execute on function orchestration.record_source_concurrency_signal(uuid,text,text,integer,integer) to service_role;

-- Runtime v2 governed agent version lifecycle.
-- Adds explicit version state, atomic promotion/rollback, and execution-time ACTIVE enforcement.

do $$
begin
  if exists (
    select 1
    from agent.agent_definitions
    where enabled
    group by agent_key
    having count(*) > 1
  ) then
    raise exception 'Cannot initialize agent version lifecycle: multiple enabled definitions exist for one agent_key';
  end if;
end;
$$;

create table if not exists agent.agent_version_lifecycle (
  agent_definition_id uuid primary key references agent.agent_definitions(id) on delete restrict,
  agent_key text not null,
  version text not null,
  lifecycle_state text not null check (lifecycle_state in ('DRAFT','VALIDATED','CANDIDATE','ACTIVE','DEPRECATED','RETIRED')),
  reason text not null check (length(btrim(reason)) > 0),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (agent_key, version)
);

create unique index if not exists agent_version_lifecycle_one_active_key
  on agent.agent_version_lifecycle(agent_key)
  where lifecycle_state = 'ACTIVE';

alter table agent.agent_version_lifecycle enable row level security;
revoke all on agent.agent_version_lifecycle from public, anon, authenticated;
grant select, insert, update on agent.agent_version_lifecycle to service_role;

insert into agent.agent_version_lifecycle(
  agent_definition_id, agent_key, version, lifecycle_state, reason, updated_by
)
select
  id,
  agent_key,
  version,
  case when enabled then 'ACTIVE' else 'DEPRECATED' end,
  'Runtime v2 lifecycle baseline from existing enabled state',
  null
from agent.agent_definitions
on conflict (agent_definition_id) do nothing;

create table if not exists agent.agent_version_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  agent_definition_id uuid not null references agent.agent_definitions(id) on delete restrict,
  agent_key text not null,
  version text not null,
  from_state text,
  to_state text not null check (to_state in ('DRAFT','VALIDATED','CANDIDATE','ACTIVE','DEPRECATED','RETIRED')),
  reason text not null check (length(btrim(reason)) > 0),
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists agent_version_lifecycle_events_definition_time_idx
  on agent.agent_version_lifecycle_events(agent_definition_id, created_at desc);

alter table agent.agent_version_lifecycle_events enable row level security;
revoke all on agent.agent_version_lifecycle_events from public, anon, authenticated;
grant select, insert on agent.agent_version_lifecycle_events to service_role;

create or replace function agent.reject_agent_version_lifecycle_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Agent version lifecycle events are immutable audit evidence' using errcode = '55000';
end;
$$;

revoke all on function agent.reject_agent_version_lifecycle_event_mutation() from public, anon, authenticated;

drop trigger if exists agent_version_lifecycle_events_immutable on agent.agent_version_lifecycle_events;
create trigger agent_version_lifecycle_events_immutable
before update or delete on agent.agent_version_lifecycle_events
for each row execute function agent.reject_agent_version_lifecycle_event_mutation();

insert into agent.agent_version_lifecycle_events(
  agent_definition_id, agent_key, version, from_state, to_state, reason, actor_user_id
)
select
  agent_definition_id, agent_key, version, null, lifecycle_state,
  'Runtime v2 lifecycle baseline from existing enabled state', null
from agent.agent_version_lifecycle l
where not exists (
  select 1
  from agent.agent_version_lifecycle_events e
  where e.agent_definition_id = l.agent_definition_id
);

create or replace function agent.agent_version_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = p_to then true
    when p_from = 'DRAFT' and p_to in ('VALIDATED','RETIRED') then true
    when p_from = 'VALIDATED' and p_to in ('CANDIDATE','RETIRED') then true
    when p_from = 'CANDIDATE' and p_to in ('ACTIVE','DEPRECATED','RETIRED') then true
    when p_from = 'ACTIVE' and p_to = 'DEPRECATED' then true
    when p_from = 'DEPRECATED' and p_to in ('ACTIVE','RETIRED') then true
    else false
  end
$$;

revoke all on function agent.agent_version_transition_allowed(text,text) from public, anon, authenticated;
grant execute on function agent.agent_version_transition_allowed(text,text) to service_role;

create or replace function agent.transition_agent_version_lifecycle(
  p_agent_definition_id uuid,
  p_target_state text,
  p_actor_user_id uuid,
  p_reason text
)
returns agent.agent_version_lifecycle
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target text := upper(btrim(coalesce(p_target_state,'')));
  v_reason text := btrim(coalesce(p_reason,''));
  v_current agent.agent_version_lifecycle%rowtype;
  v_previous_active agent.agent_version_lifecycle%rowtype;
begin
  if p_agent_definition_id is null then
    raise exception 'agent_definition_id is required' using errcode = '22023';
  end if;
  if v_target not in ('DRAFT','VALIDATED','CANDIDATE','ACTIVE','DEPRECATED','RETIRED') then
    raise exception 'Unsupported target lifecycle state: %', p_target_state using errcode = '22023';
  end if;
  if v_reason = '' then
    raise exception 'Lifecycle transition reason is required' using errcode = '22023';
  end if;

  select * into v_current
  from agent.agent_version_lifecycle
  where agent_definition_id = p_agent_definition_id
  for update;

  if not found then
    raise exception 'Agent version lifecycle was not found' using errcode = 'P0002';
  end if;

  if not agent.agent_version_transition_allowed(v_current.lifecycle_state, v_target) then
    raise exception 'Illegal agent version transition % -> %', v_current.lifecycle_state, v_target using errcode = '23514';
  end if;

  if v_current.lifecycle_state = v_target then
    return v_current;
  end if;

  if v_target = 'ACTIVE' then
    select * into v_previous_active
    from agent.agent_version_lifecycle
    where agent_key = v_current.agent_key
      and lifecycle_state = 'ACTIVE'
      and agent_definition_id <> p_agent_definition_id
    for update;

    if found then
      update agent.agent_version_lifecycle
      set lifecycle_state = 'DEPRECATED',
          reason = 'Automatically deprecated by promotion of ' || v_current.version || ': ' || v_reason,
          updated_by = p_actor_user_id,
          updated_at = now()
      where agent_definition_id = v_previous_active.agent_definition_id;

      update agent.agent_definitions
      set enabled = false
      where id = v_previous_active.agent_definition_id;

      insert into agent.agent_version_lifecycle_events(
        agent_definition_id, agent_key, version, from_state, to_state, reason, actor_user_id
      ) values (
        v_previous_active.agent_definition_id,
        v_previous_active.agent_key,
        v_previous_active.version,
        'ACTIVE',
        'DEPRECATED',
        'Automatically deprecated by promotion of ' || v_current.version || ': ' || v_reason,
        p_actor_user_id
      );
    end if;
  end if;

  update agent.agent_version_lifecycle
  set lifecycle_state = v_target,
      reason = v_reason,
      updated_by = p_actor_user_id,
      updated_at = now()
  where agent_definition_id = p_agent_definition_id
  returning * into v_current;

  update agent.agent_definitions
  set enabled = (v_target = 'ACTIVE')
  where id = p_agent_definition_id;

  insert into agent.agent_version_lifecycle_events(
    agent_definition_id, agent_key, version, from_state, to_state, reason, actor_user_id
  ) values (
    v_current.agent_definition_id,
    v_current.agent_key,
    v_current.version,
    case
      when v_target = 'ACTIVE' and v_current.reason = v_reason then
        (select lifecycle_state from agent.agent_version_lifecycle_events
          where agent_definition_id = p_agent_definition_id
          order by created_at desc
          limit 1)
      else null
    end,
    v_target,
    v_reason,
    p_actor_user_id
  );

  return v_current;
end;
$$;

-- Replace the event insert above with an explicit old-state capture wrapper.
create or replace function agent.transition_agent_version_lifecycle(
  p_agent_definition_id uuid,
  p_target_state text,
  p_actor_user_id uuid,
  p_reason text
)
returns agent.agent_version_lifecycle
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target text := upper(btrim(coalesce(p_target_state,'')));
  v_reason text := btrim(coalesce(p_reason,''));
  v_current agent.agent_version_lifecycle%rowtype;
  v_from text;
  v_previous_active agent.agent_version_lifecycle%rowtype;
begin
  if p_agent_definition_id is null then
    raise exception 'agent_definition_id is required' using errcode = '22023';
  end if;
  if v_target not in ('DRAFT','VALIDATED','CANDIDATE','ACTIVE','DEPRECATED','RETIRED') then
    raise exception 'Unsupported target lifecycle state: %', p_target_state using errcode = '22023';
  end if;
  if v_reason = '' then
    raise exception 'Lifecycle transition reason is required' using errcode = '22023';
  end if;

  select * into v_current
  from agent.agent_version_lifecycle
  where agent_definition_id = p_agent_definition_id
  for update;
  if not found then
    raise exception 'Agent version lifecycle was not found' using errcode = 'P0002';
  end if;

  v_from := v_current.lifecycle_state;
  if not agent.agent_version_transition_allowed(v_from, v_target) then
    raise exception 'Illegal agent version transition % -> %', v_from, v_target using errcode = '23514';
  end if;
  if v_from = v_target then
    return v_current;
  end if;

  if v_target = 'ACTIVE' then
    select * into v_previous_active
    from agent.agent_version_lifecycle
    where agent_key = v_current.agent_key
      and lifecycle_state = 'ACTIVE'
      and agent_definition_id <> p_agent_definition_id
    for update;

    if found then
      update agent.agent_version_lifecycle
      set lifecycle_state = 'DEPRECATED',
          reason = 'Automatically deprecated by promotion of ' || v_current.version || ': ' || v_reason,
          updated_by = p_actor_user_id,
          updated_at = now()
      where agent_definition_id = v_previous_active.agent_definition_id;

      update agent.agent_definitions
      set enabled = false
      where id = v_previous_active.agent_definition_id;

      insert into agent.agent_version_lifecycle_events(
        agent_definition_id, agent_key, version, from_state, to_state, reason, actor_user_id
      ) values (
        v_previous_active.agent_definition_id,
        v_previous_active.agent_key,
        v_previous_active.version,
        'ACTIVE',
        'DEPRECATED',
        'Automatically deprecated by promotion of ' || v_current.version || ': ' || v_reason,
        p_actor_user_id
      );
    end if;
  end if;

  update agent.agent_version_lifecycle
  set lifecycle_state = v_target,
      reason = v_reason,
      updated_by = p_actor_user_id,
      updated_at = now()
  where agent_definition_id = p_agent_definition_id
  returning * into v_current;

  update agent.agent_definitions
  set enabled = (v_target = 'ACTIVE')
  where id = p_agent_definition_id;

  insert into agent.agent_version_lifecycle_events(
    agent_definition_id, agent_key, version, from_state, to_state, reason, actor_user_id
  ) values (
    v_current.agent_definition_id,
    v_current.agent_key,
    v_current.version,
    v_from,
    v_target,
    v_reason,
    p_actor_user_id
  );

  return v_current;
end;
$$;

revoke all on function agent.transition_agent_version_lifecycle(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function agent.transition_agent_version_lifecycle(uuid,text,uuid,text) to service_role;

create or replace function agent.assert_active_agent_version(p_agent_definition_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  select lifecycle_state into v_state
  from agent.agent_version_lifecycle
  where agent_definition_id = p_agent_definition_id;

  if v_state is distinct from 'ACTIVE' then
    raise exception 'Agent definition % is not ACTIVE (state=%)', p_agent_definition_id, coalesce(v_state,'MISSING')
      using errcode = '55000';
  end if;
end;
$$;

revoke all on function agent.assert_active_agent_version(uuid) from public, anon, authenticated;
grant execute on function agent.assert_active_agent_version(uuid) to service_role;

create or replace function agent.enforce_active_agent_version_for_execution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text in ('QUEUED','RUNNING','WAITING') then
    perform agent.assert_active_agent_version(new.agent_definition_id);
  end if;
  return new;
end;
$$;

revoke all on function agent.enforce_active_agent_version_for_execution() from public, anon, authenticated;

drop trigger if exists agent_runs_active_version_execution_guard on agent.agent_runs;
create trigger agent_runs_active_version_execution_guard
before insert or update of status, agent_definition_id on agent.agent_runs
for each row execute function agent.enforce_active_agent_version_for_execution();

comment on table agent.agent_version_lifecycle is
  'Runtime v2 explicit lifecycle for immutable registered agent versions. Exactly one ACTIVE version is allowed per agent key.';
comment on table agent.agent_version_lifecycle_events is
  'Append-only evidence for agent version lifecycle transitions and atomic rollback/promotion.';
comment on function agent.transition_agent_version_lifecycle(uuid,text,uuid,text) is
  'Performs legal governed version transitions. Promotion to ACTIVE atomically deprecates the prior ACTIVE version and synchronizes legacy enabled state.';
comment on function agent.assert_active_agent_version(uuid) is
  'Fail-closed runtime guard: only ACTIVE agent definitions may enter QUEUED/RUNNING/WAITING execution states.';

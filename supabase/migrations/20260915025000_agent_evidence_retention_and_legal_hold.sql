begin;

create table if not exists agent.evidence_retention_policies (
  project_id uuid primary key references app.projects(id) on delete cascade,
  retention_years integer not null default 7 check (retention_years between 5 and 7),
  active boolean not null default true,
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table agent.agent_artifacts
  add column if not exists retention_until timestamptz;

alter table agent.agent_messages
  add column if not exists retention_until timestamptz;

update agent.agent_artifacts
set retention_until = created_at + interval '7 years'
where retention_until is null;

update agent.agent_messages
set retention_until = created_at + interval '7 years'
where retention_until is null;

alter table agent.agent_artifacts
  alter column retention_until set default (now() + interval '7 years'),
  alter column retention_until set not null;

alter table agent.agent_messages
  alter column retention_until set default (now() + interval '7 years'),
  alter column retention_until set not null;

create or replace function agent.apply_artifact_retention_policy_internal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent, app
as $$
declare
  v_project_id uuid;
  v_years integer := 7;
begin
  select r.project_id into v_project_id
  from agent.agent_runs r
  where r.id = new.agent_run_id;

  if v_project_id is null then
    raise exception 'Agent artifact requires a governed agent run project.';
  end if;

  select p.retention_years into v_years
  from agent.evidence_retention_policies p
  where p.project_id = v_project_id and p.active = true;

  v_years := coalesce(v_years, 7);
  if v_years < 5 or v_years > 7 then
    raise exception 'Agent evidence retention policy is outside the approved 5-7 year range.';
  end if;

  new.retention_until := new.created_at + make_interval(years => v_years);
  return new;
end;
$$;

create or replace function agent.apply_message_retention_policy_internal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent, app
as $$
declare
  v_projects uuid[];
  v_project_id uuid;
  v_years integer := 7;
begin
  select array_agg(distinct r.project_id) into v_projects
  from agent.agent_runs r
  where r.id = any(array_remove(array[new.source_agent_run_id, new.target_agent_run_id]::uuid[], null));

  if coalesce(cardinality(v_projects), 0) = 0 then
    raise exception 'Agent message requires at least one governed agent run project.';
  end if;
  if cardinality(v_projects) <> 1 then
    raise exception 'Cross-project agent messages are not allowed in the governed evidence lifecycle.';
  end if;

  v_project_id := v_projects[1];
  select p.retention_years into v_years
  from agent.evidence_retention_policies p
  where p.project_id = v_project_id and p.active = true;

  v_years := coalesce(v_years, 7);
  if v_years < 5 or v_years > 7 then
    raise exception 'Agent evidence retention policy is outside the approved 5-7 year range.';
  end if;

  new.retention_until := new.created_at + make_interval(years => v_years);
  return new;
end;
$$;

drop trigger if exists trg_agent_artifact_retention_policy on agent.agent_artifacts;
create trigger trg_agent_artifact_retention_policy
before insert on agent.agent_artifacts
for each row execute function agent.apply_artifact_retention_policy_internal();

drop trigger if exists trg_agent_message_retention_policy on agent.agent_messages;
create trigger trg_agent_message_retention_policy
before insert on agent.agent_messages
for each row execute function agent.apply_message_retention_policy_internal();

create or replace function agent.set_evidence_retention_policy_internal(
  p_project_id uuid,
  p_retention_years integer,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, agent, app
as $$
begin
  if p_retention_years < 5 or p_retention_years > 7 then
    raise exception 'Agent evidence retention must be between 5 and 7 years.';
  end if;

  insert into agent.evidence_retention_policies(project_id, retention_years, active, updated_by, updated_at)
  values (p_project_id, p_retention_years, true, p_updated_by, now())
  on conflict (project_id) do update
    set retention_years = excluded.retention_years,
        active = true,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  update agent.agent_artifacts a
  set retention_until = a.created_at + make_interval(years => p_retention_years)
  from agent.agent_runs r
  where a.agent_run_id = r.id
    and r.project_id = p_project_id;

  update agent.agent_messages m
  set retention_until = m.created_at + make_interval(years => p_retention_years)
  where exists (
    select 1 from agent.agent_runs r
    where r.project_id = p_project_id
      and r.id = any(array_remove(array[m.source_agent_run_id, m.target_agent_run_id]::uuid[], null))
  );
end;
$$;

revoke all on function agent.apply_artifact_retention_policy_internal() from public, anon, authenticated;
revoke all on function agent.apply_message_retention_policy_internal() from public, anon, authenticated;
revoke all on function agent.set_evidence_retention_policy_internal(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function agent.set_evidence_retention_policy_internal(uuid, integer, uuid) to service_role;

create table if not exists agent.evidence_legal_holds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('ARTIFACT','MESSAGE','AUDIT_RECORD')),
  evidence_id uuid not null,
  reason text not null check (length(btrim(reason)) > 0),
  active boolean not null default true,
  placed_by uuid not null references auth.users(id),
  placed_at timestamptz not null default now(),
  released_by uuid null references auth.users(id),
  released_at timestamptz null,
  constraint evidence_legal_holds_release_consistency check (
    (active and released_by is null and released_at is null)
    or
    (not active and released_by is not null and released_at is not null)
  )
);

create unique index if not exists ux_evidence_legal_holds_active
  on agent.evidence_legal_holds(project_id, evidence_type, evidence_id)
  where active;

create index if not exists idx_agent_artifacts_retention
  on agent.agent_artifacts(retention_until);

create index if not exists idx_agent_messages_retention
  on agent.agent_messages(retention_until);

alter table agent.evidence_retention_policies enable row level security;
alter table agent.evidence_legal_holds enable row level security;

revoke all on agent.evidence_retention_policies from anon, authenticated;
revoke all on agent.evidence_legal_holds from anon, authenticated;

grant select, insert, update, delete on agent.evidence_retention_policies to service_role;
grant select, insert, update, delete on agent.evidence_legal_holds to service_role;

commit;

create unique index if not exists uq_job_queue_project_job_id
  on orchestration.job_queue(project_id, id);

create table if not exists orchestration.job_dependencies (
  project_id uuid not null references app.projects(id) on delete cascade,
  job_id uuid not null,
  depends_on_job_id uuid not null,
  dependency_type text not null default 'SUCCESS' check (dependency_type in ('SUCCESS','TERMINAL')),
  created_at timestamptz not null default now(),
  primary key (job_id, depends_on_job_id),
  constraint job_dependencies_not_self check (job_id <> depends_on_job_id),
  constraint job_dependencies_child_project_fkey
    foreign key (project_id, job_id)
    references orchestration.job_queue(project_id, id)
    on delete cascade,
  constraint job_dependencies_parent_project_fkey
    foreign key (project_id, depends_on_job_id)
    references orchestration.job_queue(project_id, id)
    on delete cascade
);

create index if not exists idx_job_dependencies_parent
  on orchestration.job_dependencies(project_id, depends_on_job_id);

alter table orchestration.job_dependencies enable row level security;
revoke all on table orchestration.job_dependencies from public, anon, authenticated;

comment on table orchestration.job_dependencies is
  'Structural orchestration dependencies between durable jobs. These edges are scheduler dependencies only and are not source-observed data lineage or transformation lineage.';

create or replace function orchestration.validate_job_dependency_cycle()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'orchestration'
as $$
begin
  if new.job_id = new.depends_on_job_id then
    raise exception 'A durable job cannot depend on itself';
  end if;

  if exists (
    with recursive ancestors(job_id) as (
      select new.depends_on_job_id
      union
      select d.depends_on_job_id
      from orchestration.job_dependencies d
      join ancestors a on d.job_id = a.job_id
      where d.project_id = new.project_id
    )
    select 1 from ancestors where job_id = new.job_id
  ) then
    raise exception 'Durable job dependency would create a cycle';
  end if;

  return new;
end;
$$;

revoke all on function orchestration.validate_job_dependency_cycle() from public, anon, authenticated;

drop trigger if exists trg_validate_job_dependency_cycle on orchestration.job_dependencies;
create trigger trg_validate_job_dependency_cycle
before insert or update on orchestration.job_dependencies
for each row execute function orchestration.validate_job_dependency_cycle();

create or replace function orchestration.resolve_failed_job_dependencies()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'orchestration'
as $$
declare
  v_count integer := 0;
begin
  with cancelled as (
    update orchestration.job_queue child
       set status = 'CANCELLED',
           completed_at = coalesce(child.completed_at, now()),
           lease_owner = null,
           lease_expires_at = null,
           last_error = 'Cancelled because a required SUCCESS dependency reached a terminal failure state.',
           updated_at = now()
      from orchestration.job_dependencies d
      join orchestration.job_queue parent on parent.id = d.depends_on_job_id
     where d.job_id = child.id
       and d.project_id = child.project_id
       and d.dependency_type = 'SUCCESS'
       and child.status = 'QUEUED'
       and parent.status in ('FAILED','DEAD','CANCELLED')
    returning child.id, child.project_id, child.job_type
  ), telemetry as (
    insert into orchestration.platform_telemetry(project_id, metric_key, numeric_value, dimensions)
    select project_id,
           'job.dependency_cancelled',
           1,
           jsonb_build_object('job_id', id, 'job_type', job_type, 'reason', 'FAILED_SUCCESS_DEPENDENCY')
    from cancelled
    returning 1
  )
  select count(*) into v_count from telemetry;

  return v_count;
end;
$$;

grant execute on function orchestration.resolve_failed_job_dependencies() to service_role;

create or replace function orchestration.enqueue_job_with_dependencies(
  p_project_id uuid,
  p_job_type text,
  p_entity_id uuid,
  p_agent_run_id uuid,
  p_idempotency_key text,
  p_payload jsonb,
  p_priority integer,
  p_max_attempts integer,
  p_available_at timestamptz,
  p_dependencies jsonb default '[]'::jsonb
)
returns orchestration.job_queue
language plpgsql
security definer
set search_path to 'pg_catalog', 'orchestration'
as $$
declare
  v_job orchestration.job_queue;
  v_dependency jsonb;
  v_parent_id uuid;
  v_dependency_type text;
begin
  insert into orchestration.job_queue(
    project_id, job_type, entity_id, agent_run_id, idempotency_key,
    payload, priority, max_attempts, available_at
  ) values (
    p_project_id, p_job_type, p_entity_id, p_agent_run_id, p_idempotency_key,
    coalesce(p_payload, '{}'::jsonb), coalesce(p_priority, 100),
    greatest(1, coalesce(p_max_attempts, 3)), coalesce(p_available_at, now())
  )
  returning * into v_job;

  for v_dependency in
    select value from jsonb_array_elements(coalesce(p_dependencies, '[]'::jsonb))
  loop
    v_parent_id := nullif(v_dependency->>'job_id', '')::uuid;
    v_dependency_type := upper(coalesce(nullif(v_dependency->>'dependency_type', ''), 'SUCCESS'));
    if v_parent_id is null then
      raise exception 'Durable job dependency job_id is required';
    end if;
    if v_dependency_type not in ('SUCCESS','TERMINAL') then
      raise exception 'Unsupported durable job dependency type: %', v_dependency_type;
    end if;

    insert into orchestration.job_dependencies(project_id, job_id, depends_on_job_id, dependency_type)
    values (p_project_id, v_job.id, v_parent_id, v_dependency_type)
    on conflict (job_id, depends_on_job_id) do update
      set dependency_type = excluded.dependency_type;
  end loop;

  return v_job;
end;
$$;

revoke all on function orchestration.enqueue_job_with_dependencies(uuid,text,uuid,uuid,text,jsonb,integer,integer,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function orchestration.enqueue_job_with_dependencies(uuid,text,uuid,uuid,text,jsonb,integer,integer,timestamptz,jsonb) to service_role;

comment on function orchestration.enqueue_job_with_dependencies(uuid,text,uuid,uuid,text,jsonb,integer,integer,timestamptz,jsonb) is
  'Atomically creates a durable job and its structural scheduler dependency edges before transaction commit.';

create or replace function orchestration.claim_jobs(p_worker text, p_limit integer default 2)
returns setof orchestration.job_queue
language plpgsql
security definer
set search_path to 'pg_catalog', 'orchestration'
as $$
begin
  perform orchestration.resolve_failed_job_dependencies();

  return query
  with candidates as (
    select q.id
    from orchestration.job_queue q
    where q.status = 'QUEUED'
      and q.available_at <= now()
      and (q.lease_expires_at is null or q.lease_expires_at < now())
      and q.attempts < q.max_attempts
      and not exists (
        select 1
        from orchestration.job_dependencies d
        join orchestration.job_queue parent on parent.id = d.depends_on_job_id
        where d.job_id = q.id
          and (
            (d.dependency_type = 'SUCCESS' and parent.status <> 'SUCCEEDED')
            or
            (d.dependency_type = 'TERMINAL' and parent.status not in ('SUCCEEDED','FAILED','DEAD','CANCELLED'))
          )
      )
    order by q.priority asc, q.created_at asc
    for update of q skip locked
    limit greatest(1, least(coalesce(p_limit, 2), 50))
  )
  update orchestration.job_queue q
     set status = 'RUNNING',
         lease_owner = p_worker,
         lease_expires_at = now() + interval '10 minutes',
         attempts = q.attempts + 1,
         started_at = coalesce(q.started_at, now()),
         updated_at = now()
    from candidates c
   where q.id = c.id
  returning q.*;
end;
$$;

create or replace function orchestration.claim_job_by_agent_run(p_worker text, p_agent_run_id uuid)
returns orchestration.job_queue
language plpgsql
security definer
set search_path to 'pg_catalog', 'orchestration'
as $$
declare
  v_job orchestration.job_queue;
begin
  perform orchestration.resolve_failed_job_dependencies();

  update orchestration.job_queue q
     set status = 'RUNNING',
         lease_owner = p_worker,
         lease_expires_at = now() + interval '10 minutes',
         attempts = q.attempts + 1,
         started_at = coalesce(q.started_at, now()),
         updated_at = now()
   where q.id = (
     select candidate.id
     from orchestration.job_queue candidate
     where candidate.agent_run_id = p_agent_run_id
       and candidate.status = 'QUEUED'
       and candidate.available_at <= now()
       and (candidate.lease_expires_at is null or candidate.lease_expires_at < now())
       and candidate.attempts < candidate.max_attempts
       and not exists (
         select 1
         from orchestration.job_dependencies d
         join orchestration.job_queue parent on parent.id = d.depends_on_job_id
         where d.job_id = candidate.id
           and (
             (d.dependency_type = 'SUCCESS' and parent.status <> 'SUCCEEDED')
             or
             (d.dependency_type = 'TERMINAL' and parent.status not in ('SUCCEEDED','FAILED','DEAD','CANCELLED'))
           )
       )
     order by candidate.created_at desc
     limit 1
     for update skip locked
   )
  returning q.* into v_job;

  return v_job;
end;
$$;

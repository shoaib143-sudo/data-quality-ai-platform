begin;

create table if not exists governance.ai_capability_e2e_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  run_label text not null,
  status text not null default 'RUNNING' check (status in ('RUNNING','COMPLETED','BLOCKED','FAILED','CANCELLED')),
  scope jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.ai_capability_e2e_run_datasets (
  run_id uuid not null references governance.ai_capability_e2e_runs(id) on delete cascade,
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete restrict,
  primary key (run_id, dataset_version_id)
);

create table if not exists governance.ai_capability_e2e_results (
  run_id uuid not null references governance.ai_capability_e2e_runs(id) on delete cascade,
  capability_id integer not null check (capability_id between 1 and 75),
  capability text not null,
  evidence_domain text not null,
  execution_status text not null default 'NOT_RUN' check (execution_status in ('NOT_RUN','EXECUTED','BLOCKED','EVIDENCED_ONLY','FAILED')),
  evidence_count bigint not null default 0 check (evidence_count >= 0),
  evidence_refs jsonb not null default '[]'::jsonb,
  blocker_code text,
  details jsonb not null default '{}'::jsonb,
  executed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (run_id, capability_id)
);

create index if not exists idx_ai_capability_e2e_runs_project_created
  on governance.ai_capability_e2e_runs(project_id, created_at desc);
create index if not exists idx_ai_capability_e2e_results_status
  on governance.ai_capability_e2e_results(run_id, execution_status, capability_id);

alter table governance.ai_capability_e2e_runs enable row level security;
alter table governance.ai_capability_e2e_run_datasets enable row level security;
alter table governance.ai_capability_e2e_results enable row level security;

revoke all on governance.ai_capability_e2e_runs from anon, authenticated;
revoke all on governance.ai_capability_e2e_run_datasets from anon, authenticated;
revoke all on governance.ai_capability_e2e_results from anon, authenticated;
grant select, insert, update on governance.ai_capability_e2e_runs to service_role;
grant select, insert, update on governance.ai_capability_e2e_run_datasets to service_role;
grant select, insert, update on governance.ai_capability_e2e_results to service_role;

create or replace function governance.start_ai_capability_e2e_run(
  p_project_id uuid,
  p_dataset_version_ids uuid[],
  p_run_label text,
  p_scope jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = governance, catalog, app, public
as $$
declare
  v_run_id uuid;
  v_expected integer;
  v_found integer;
begin
  if p_project_id is null then raise exception 'project_id is required'; end if;
  if coalesce(array_length(p_dataset_version_ids, 1), 0) = 0 then raise exception 'at least one dataset version is required'; end if;
  if nullif(btrim(p_run_label), '') is null then raise exception 'run_label is required'; end if;

  select count(distinct x) into v_expected from unnest(p_dataset_version_ids) x;
  select count(distinct dv.id) into v_found
  from catalog.dataset_versions dv
  join catalog.datasets d on d.id = dv.dataset_id
  where dv.id = any(p_dataset_version_ids)
    and d.project_id = p_project_id;

  if v_found <> v_expected then
    raise exception 'all dataset versions must belong to the requested project';
  end if;

  insert into governance.ai_capability_e2e_runs(project_id, run_label, scope)
  values (p_project_id, btrim(p_run_label), coalesce(p_scope, '{}'::jsonb))
  returning id into v_run_id;

  insert into governance.ai_capability_e2e_run_datasets(run_id, dataset_version_id)
  select v_run_id, x from (select distinct unnest(p_dataset_version_ids) x) s;

  insert into governance.ai_capability_e2e_results(run_id, capability_id, capability, evidence_domain)
  select v_run_id, capability_id, capability, evidence_domain
  from governance.generate_ai_capability_matrix(p_project_id)
  order by capability_id;

  if (select count(*) from governance.ai_capability_e2e_results where run_id = v_run_id) <> 75 then
    raise exception 'capability matrix must contain exactly 75 rows';
  end if;

  return v_run_id;
end;
$$;

create or replace function governance.record_ai_capability_e2e_result(
  p_run_id uuid,
  p_capability_id integer,
  p_execution_status text,
  p_evidence_refs jsonb default '[]'::jsonb,
  p_blocker_code text default null,
  p_details jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = governance, public
as $$
declare
  v_count bigint;
begin
  if p_execution_status not in ('NOT_RUN','EXECUTED','BLOCKED','EVIDENCED_ONLY','FAILED') then
    raise exception 'invalid execution status %', p_execution_status;
  end if;
  if jsonb_typeof(coalesce(p_evidence_refs, '[]'::jsonb)) <> 'array' then
    raise exception 'evidence_refs must be a JSON array';
  end if;
  v_count := jsonb_array_length(coalesce(p_evidence_refs, '[]'::jsonb));
  if p_execution_status = 'EXECUTED' and v_count = 0 then
    raise exception 'EXECUTED requires at least one run-scoped evidence reference';
  end if;
  if p_execution_status = 'BLOCKED' and nullif(btrim(coalesce(p_blocker_code,'')), '') is null then
    raise exception 'BLOCKED requires blocker_code';
  end if;

  update governance.ai_capability_e2e_results
  set execution_status = p_execution_status,
      evidence_count = v_count,
      evidence_refs = coalesce(p_evidence_refs, '[]'::jsonb),
      blocker_code = nullif(btrim(coalesce(p_blocker_code,'')), ''),
      details = coalesce(p_details, '{}'::jsonb),
      executed_at = case when p_execution_status = 'EXECUTED' then now() else executed_at end,
      updated_at = now()
  where run_id = p_run_id and capability_id = p_capability_id;

  if not found then raise exception 'run/capability result not found'; end if;
end;
$$;

create or replace function governance.finalize_ai_capability_e2e_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = governance, public
as $$
declare
  v_summary jsonb;
  v_status text;
begin
  select jsonb_build_object(
    'total', count(*),
    'executed', count(*) filter (where execution_status='EXECUTED'),
    'blocked', count(*) filter (where execution_status='BLOCKED'),
    'failed', count(*) filter (where execution_status='FAILED'),
    'not_run', count(*) filter (where execution_status='NOT_RUN'),
    'evidenced_only', count(*) filter (where execution_status='EVIDENCED_ONLY')
  ) into v_summary
  from governance.ai_capability_e2e_results
  where run_id = p_run_id;

  if coalesce((v_summary->>'total')::int,0) <> 75 then raise exception 'run does not contain exactly 75 capability rows'; end if;

  v_status := case
    when (v_summary->>'failed')::int > 0 then 'FAILED'
    when (v_summary->>'blocked')::int > 0 or (v_summary->>'not_run')::int > 0 then 'BLOCKED'
    else 'COMPLETED'
  end;

  update governance.ai_capability_e2e_runs
  set status=v_status, summary=v_summary, completed_at=now(), updated_at=now()
  where id=p_run_id;
  if not found then raise exception 'run not found'; end if;
  return v_summary || jsonb_build_object('status',v_status,'run_id',p_run_id);
end;
$$;

revoke all on function governance.start_ai_capability_e2e_run(uuid,uuid[],text,jsonb) from public, anon, authenticated;
revoke all on function governance.record_ai_capability_e2e_result(uuid,integer,text,jsonb,text,jsonb) from public, anon, authenticated;
revoke all on function governance.finalize_ai_capability_e2e_run(uuid) from public, anon, authenticated;
grant execute on function governance.start_ai_capability_e2e_run(uuid,uuid[],text,jsonb) to service_role;
grant execute on function governance.record_ai_capability_e2e_result(uuid,integer,text,jsonb,text,jsonb) to service_role;
grant execute on function governance.finalize_ai_capability_e2e_run(uuid) to service_role;

comment on table governance.ai_capability_e2e_results is 'Run-scoped execution ledger for the 75 AI capability portfolio. Project-wide evidence must not be promoted to EXECUTED without run-scoped evidence references.';

commit;

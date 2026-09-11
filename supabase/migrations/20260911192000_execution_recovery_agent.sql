-- Governed Execution Recovery Agent.
-- Recovery evidence is derived only from persisted durable-job failures.
-- Automatic durable retries remain owned by the queue. This layer activates only
-- after a job is terminal (DEAD) and never fabricates a successful execution.

create table if not exists orchestration.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  durable_job_id uuid not null references orchestration.job_queue(id) on delete cascade,
  agent_run_id uuid null references agent.agent_runs(id) on delete set null,
  job_type text not null,
  classification text not null check (classification in (
    'TRANSIENT_EXTERNAL', 'ORCHESTRATION', 'CONFIGURATION', 'DEPLOYMENT_SCHEMA',
    'DATA_CONTRACT', 'AUTHORIZATION', 'UNKNOWN'
  )),
  recommended_action text not null check (recommended_action in ('RETRY', 'MANUAL_REVIEW', 'ROLLBACK_REVIEW')),
  consent_requirement text not null default 'OPERATOR' check (consent_requirement in ('NONE', 'OPERATOR')),
  status text not null default 'OPEN' check (status in ('OPEN', 'ACKNOWLEDGED', 'RETRY_QUEUED', 'AWAITING_MANUAL_REVIEW', 'RESOLVED')),
  failure_summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recovery_cases_durable_job_key unique (durable_job_id)
);

create index if not exists recovery_cases_project_status_idx
  on orchestration.recovery_cases(project_id, status, last_detected_at desc);
create index if not exists recovery_cases_agent_run_idx
  on orchestration.recovery_cases(agent_run_id, last_detected_at desc)
  where agent_run_id is not null;

create table if not exists orchestration.recovery_actions (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid not null references orchestration.recovery_cases(id) on delete cascade,
  project_id uuid not null,
  action_type text not null check (action_type in ('RETRY', 'ACKNOWLEDGE', 'ROLLBACK_REVIEW')),
  requested_by uuid null references auth.users(id) on delete set null,
  consent_source text not null default 'OPERATOR' check (consent_source in ('SYSTEM', 'OPERATOR')),
  status text not null check (status in ('EXECUTED', 'QUEUED', 'REQUESTED', 'REJECTED')),
  outcome jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  executed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists recovery_actions_case_idx
  on orchestration.recovery_actions(recovery_case_id, created_at desc);

comment on table orchestration.recovery_cases is
  'Canonical evidence-backed recovery cases created from terminal durable job failures; no synthetic failure evidence.';
comment on table orchestration.recovery_actions is
  'Append-only operator/system recovery action ledger. Rollback is review-only unless a separately governed implementation exists.';

alter table orchestration.recovery_cases enable row level security;
alter table orchestration.recovery_actions enable row level security;

drop policy if exists recovery_cases_project_read on orchestration.recovery_cases;
create policy recovery_cases_project_read
  on orchestration.recovery_cases
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists recovery_actions_project_read on orchestration.recovery_actions;
create policy recovery_actions_project_read
  on orchestration.recovery_actions
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

revoke all on orchestration.recovery_cases from anon, authenticated;
revoke all on orchestration.recovery_actions from anon, authenticated;
grant select on orchestration.recovery_cases to authenticated;
grant select on orchestration.recovery_actions to authenticated;

create or replace function orchestration.execution_recovery_classification(
  p_job_type text,
  p_last_error text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_error text := lower(coalesce(p_last_error, ''));
  v_job_type text := upper(coalesce(p_job_type, ''));
  v_retry_safe boolean := v_job_type in ('PROFILING', 'OBSERVABILITY', 'NOTIFICATION', 'DISCOVERY', 'LINEAGE_ENRICHMENT', 'SEMANTIC_INDEX', 'GOVERNANCE_AGENT');
begin
  if v_error ~ '(permission|not authorized|authorization|forbidden|access denied)' then
    return jsonb_build_object('classification', 'AUTHORIZATION', 'recommended_action', 'MANUAL_REVIEW');
  end if;

  if v_error ~ '(constraint|violates|invalid schema|schema cache|function .* does not exist|rpc)' then
    return jsonb_build_object(
      'classification', case when v_error ~ '(schema|function|rpc)' then 'DEPLOYMENT_SCHEMA' else 'DATA_CONTRACT' end,
      'recommended_action', 'MANUAL_REVIEW'
    );
  end if;

  if v_error ~ '(payload is incomplete|configuration|config is incomplete|required configuration|missing .*id)' then
    return jsonb_build_object('classification', 'CONFIGURATION', 'recommended_action', 'MANUAL_REVIEW');
  end if;

  if v_error ~ '(lease expired|orphaned|worker lease|worker.*timeout)' then
    return jsonb_build_object(
      'classification', 'ORCHESTRATION',
      'recommended_action', case when v_retry_safe then 'RETRY' else 'MANUAL_REVIEW' end
    );
  end if;

  if v_error ~ '(jdbc|connection|connect timeout|connection reset|temporar|timed out|timeout|network|econnreset|econnrefused|fetch failed|socket)' then
    return jsonb_build_object(
      'classification', 'TRANSIENT_EXTERNAL',
      'recommended_action', case when v_retry_safe then 'RETRY' else 'MANUAL_REVIEW' end
    );
  end if;

  return jsonb_build_object('classification', 'UNKNOWN', 'recommended_action', 'MANUAL_REVIEW');
end;
$function$;

create or replace function orchestration.capture_terminal_recovery_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_decision jsonb;
  v_classification text;
  v_action text;
begin
  if new.status <> 'DEAD' or old.status is not distinct from 'DEAD' then
    return new;
  end if;

  v_decision := orchestration.execution_recovery_classification(new.job_type, new.last_error);
  v_classification := v_decision->>'classification';
  v_action := v_decision->>'recommended_action';

  insert into orchestration.recovery_cases (
    project_id,
    durable_job_id,
    agent_run_id,
    job_type,
    classification,
    recommended_action,
    consent_requirement,
    status,
    failure_summary,
    evidence,
    first_detected_at,
    last_detected_at,
    updated_at
  ) values (
    new.project_id,
    new.id,
    new.agent_run_id,
    new.job_type,
    v_classification,
    v_action,
    'OPERATOR',
    'OPEN',
    'Durable execution exhausted its retry budget. Review persisted run/job evidence before acting.',
    jsonb_build_object(
      'durable_job_id', new.id,
      'agent_run_id', new.agent_run_id,
      'job_type', new.job_type,
      'attempts', new.attempts,
      'max_attempts', new.max_attempts,
      'terminal_status', new.status,
      'idempotency_key_present', new.idempotency_key is not null
    ),
    now(),
    now(),
    now()
  )
  on conflict (durable_job_id) do update set
    classification = excluded.classification,
    recommended_action = excluded.recommended_action,
    consent_requirement = excluded.consent_requirement,
    status = 'OPEN',
    failure_summary = excluded.failure_summary,
    evidence = excluded.evidence,
    occurrence_count = orchestration.recovery_cases.occurrence_count + 1,
    last_detected_at = now(),
    resolved_at = null,
    updated_at = now();

  return new;
end;
$function$;

comment on function orchestration.capture_terminal_recovery_case() is
  'Creates or reopens a canonical recovery case only when a durable job becomes DEAD.';

drop trigger if exists trg_capture_terminal_recovery_case on orchestration.job_queue;
create trigger trg_capture_terminal_recovery_case
after update of status on orchestration.job_queue
for each row
when (new.status = 'DEAD')
execute function orchestration.capture_terminal_recovery_case();

-- Prevent the durable queue from reporting profiling success when the governed
-- parent run has no genuine canonical successful output/artifact.
create or replace function orchestration.enforce_profiling_job_success_integrity()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.job_type = 'PROFILING' and new.status = 'SUCCEEDED' then
    if new.agent_run_id is null or not exists (
      select 1
      from agent.agent_runs r
      where r.id = new.agent_run_id
        and r.status = 'SUCCEEDED'
        and r.output is not null
        and exists (
          select 1
          from agent.agent_artifacts a
          where a.agent_run_id = r.id
            and a.artifact_type = 'AGENT_RUN_RESULT'
            and a.artifact_version = '1.0'
        )
    ) then
      raise exception 'profiling durable job % cannot be marked SUCCEEDED without canonical agent result evidence', new.id;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_profiling_job_success_integrity on orchestration.job_queue;
create trigger trg_enforce_profiling_job_success_integrity
before update of status on orchestration.job_queue
for each row
when (new.status = 'SUCCEEDED')
execute function orchestration.enforce_profiling_job_success_integrity();

create or replace function orchestration.request_execution_recovery_action(
  p_case_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case orchestration.recovery_cases%rowtype;
  v_job orchestration.job_queue%rowtype;
  v_action text := upper(trim(coalesce(p_action, '')));
  v_action_id uuid;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into v_case
  from orchestration.recovery_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Recovery case not found.' using errcode = 'P0002';
  end if;

  if not app_private.is_project_member(v_case.project_id) then
    raise exception 'Recovery case is outside the current project scope.' using errcode = '42501';
  end if;

  if v_action not in ('RETRY', 'ACKNOWLEDGE', 'ROLLBACK_REVIEW') then
    raise exception 'Unsupported recovery action: %', v_action using errcode = '22023';
  end if;

  if v_action = 'RETRY' then
    if v_case.recommended_action <> 'RETRY' then
      raise exception 'This recovery case is not classified as safe for queue retry.' using errcode = '22023';
    end if;

    select * into v_job
    from orchestration.job_queue
    where id = v_case.durable_job_id
    for update;

    if not found or v_job.status <> 'DEAD' then
      raise exception 'The durable job is not in a retryable terminal state.' using errcode = '55000';
    end if;

    update orchestration.job_queue
       set status = 'QUEUED',
           max_attempts = greatest(max_attempts, attempts + 1),
           available_at = v_now,
           lease_owner = null,
           lease_expires_at = null,
           completed_at = null,
           updated_at = v_now
     where id = v_job.id;

    insert into orchestration.recovery_actions (
      recovery_case_id, project_id, action_type, requested_by, consent_source, status, outcome, requested_at, executed_at
    ) values (
      v_case.id, v_case.project_id, 'RETRY', auth.uid(), 'OPERATOR', 'QUEUED',
      jsonb_build_object('durable_job_id', v_job.id, 'attempts_before_retry', v_job.attempts, 'max_attempts_after_retry', greatest(v_job.max_attempts, v_job.attempts + 1)),
      v_now, v_now
    ) returning id into v_action_id;

    update orchestration.recovery_cases
       set status = 'RETRY_QUEUED', updated_at = v_now
     where id = v_case.id;

  elsif v_action = 'ROLLBACK_REVIEW' then
    insert into orchestration.recovery_actions (
      recovery_case_id, project_id, action_type, requested_by, consent_source, status, outcome, requested_at
    ) values (
      v_case.id, v_case.project_id, 'ROLLBACK_REVIEW', auth.uid(), 'OPERATOR', 'REQUESTED',
      jsonb_build_object('execution', 'NOT_AUTOMATED', 'reason', 'Rollback requires separately governed review and implementation evidence.'),
      v_now
    ) returning id into v_action_id;

    update orchestration.recovery_cases
       set status = 'AWAITING_MANUAL_REVIEW', updated_at = v_now
     where id = v_case.id;

  else
    insert into orchestration.recovery_actions (
      recovery_case_id, project_id, action_type, requested_by, consent_source, status, outcome, requested_at, executed_at
    ) values (
      v_case.id, v_case.project_id, 'ACKNOWLEDGE', auth.uid(), 'OPERATOR', 'EXECUTED',
      jsonb_build_object('acknowledged', true), v_now, v_now
    ) returning id into v_action_id;

    update orchestration.recovery_cases
       set status = 'ACKNOWLEDGED', updated_at = v_now
     where id = v_case.id;
  end if;

  return jsonb_build_object(
    'case_id', v_case.id,
    'action_id', v_action_id,
    'action', v_action,
    'requested_at', v_now
  );
end;
$function$;

revoke all on function orchestration.request_execution_recovery_action(uuid, text) from public, anon;
grant execute on function orchestration.request_execution_recovery_action(uuid, text) to authenticated;

-- Backfill only real persisted terminal jobs. This is evidence promotion, not
-- synthetic execution. Re-running the migration is idempotent by durable_job_id.
insert into orchestration.recovery_cases (
  project_id,
  durable_job_id,
  agent_run_id,
  job_type,
  classification,
  recommended_action,
  consent_requirement,
  status,
  failure_summary,
  evidence,
  first_detected_at,
  last_detected_at,
  created_at,
  updated_at
)
select
  q.project_id,
  q.id,
  q.agent_run_id,
  q.job_type,
  decision.value->>'classification',
  decision.value->>'recommended_action',
  'OPERATOR',
  'OPEN',
  'Durable execution exhausted its retry budget. Review persisted run/job evidence before acting.',
  jsonb_build_object(
    'durable_job_id', q.id,
    'agent_run_id', q.agent_run_id,
    'job_type', q.job_type,
    'attempts', q.attempts,
    'max_attempts', q.max_attempts,
    'terminal_status', q.status,
    'idempotency_key_present', q.idempotency_key is not null
  ),
  coalesce(q.completed_at, q.updated_at, q.created_at),
  coalesce(q.completed_at, q.updated_at, q.created_at),
  coalesce(q.completed_at, q.updated_at, q.created_at),
  now()
from orchestration.job_queue q
cross join lateral (select orchestration.execution_recovery_classification(q.job_type, q.last_error) as value) decision
where q.status = 'DEAD'
on conflict (durable_job_id) do nothing;

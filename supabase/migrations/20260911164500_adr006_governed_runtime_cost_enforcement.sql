-- ADR-006 governed runtime cost enforcement.
-- Cost decisions use only canonical provider-observed usage plus an exact reviewed pricing version.
-- USD limits are enforced only for the canonical PROJECT/PROJECT budget. No FX conversion or cost estimation is permitted.

create table if not exists governance.ai_runtime_cost_enforcement_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  cost_event_id uuid not null references governance.ai_model_cost_events(id) on delete restrict,
  policy_version_id uuid not null references governance.ai_resource_budget_policy_versions(id) on delete restrict,
  allowed boolean not null,
  reason text not null check (reason in (
    'ALLOWED','NO_COST_LIMIT','COST_EVIDENCE_INCOMPLETE','COST_CURRENCY_UNSUPPORTED',
    'PER_REQUEST_COST_LIMIT','DAILY_COST_LIMIT','POLICY_NOT_CURRENT','POLICY_DISABLED'
  )),
  request_cost_usd numeric(20,10),
  daily_cost_before_usd numeric(20,10),
  daily_cost_after_usd numeric(20,10),
  request_limit_usd numeric(20,10),
  daily_limit_usd numeric(20,10),
  evaluated_at timestamptz not null default now(),
  unique (cost_event_id, policy_version_id)
);

create index if not exists ai_runtime_cost_enforcement_project_time_idx
  on governance.ai_runtime_cost_enforcement_decisions(project_id, evaluated_at desc);

create or replace function governance.reject_ai_runtime_cost_enforcement_decision_mutation()
returns trigger
language plpgsql
security definer
set search_path = governance, pg_temp
as $$
begin
  raise exception 'AI runtime cost enforcement decisions are immutable audit evidence' using errcode = '55000';
end;
$$;

drop trigger if exists ai_runtime_cost_enforcement_decisions_immutable on governance.ai_runtime_cost_enforcement_decisions;
create trigger ai_runtime_cost_enforcement_decisions_immutable
before update or delete on governance.ai_runtime_cost_enforcement_decisions
for each row execute function governance.reject_ai_runtime_cost_enforcement_decision_mutation();

alter table governance.ai_runtime_cost_enforcement_decisions enable row level security;
create policy ai_runtime_cost_enforcement_decisions_read
  on governance.ai_runtime_cost_enforcement_decisions
  for select
  using (app_private.is_project_member(project_id));

-- Pre-invocation daily admission. Once a hard daily USD limit is configured, incomplete
-- or non-USD cost evidence makes the daily total unknowable and therefore fails closed.
create or replace function governance.acquire_ai_project_resource_budget_admission(
  p_project_id uuid,
  p_policy_version_id uuid,
  p_correlation_id uuid,
  p_lease_ttl_seconds integer default 300
)
returns table (
  admitted boolean,
  reason text,
  admission_id uuid,
  lease_id uuid,
  request_count_last_minute integer,
  active_concurrency integer,
  lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, governance
as $$
declare
  v_policy governance.ai_resource_budget_policy_versions%rowtype;
  v_existing_admission governance.ai_resource_budget_request_admissions%rowtype;
  v_existing_lease governance.ai_resource_budget_concurrency_leases%rowtype;
  v_admission_id uuid;
  v_lease_id uuid;
  v_request_count integer := 0;
  v_active_concurrency integer := 0;
  v_now timestamptz := clock_timestamp();
  v_lease_expires_at timestamptz;
  v_incomplete_cost_events integer := 0;
  v_non_usd_cost_events integer := 0;
  v_daily_cost numeric(20,10) := 0;
begin
  if p_project_id is null or p_policy_version_id is null or p_correlation_id is null then
    raise exception 'project_id, policy_version_id, and correlation_id are required';
  end if;
  if p_lease_ttl_seconds < 1 or p_lease_ttl_seconds > 3600 then
    raise exception 'lease_ttl_seconds must be between 1 and 3600';
  end if;

  perform pg_advisory_xact_lock(governance.ai_project_resource_budget_lock_key(p_project_id));

  select versions.* into v_policy
  from governance.ai_resource_budget_policy_effective effective
  join governance.ai_resource_budget_policy_versions versions on versions.id = effective.id
  where effective.project_id = p_project_id
    and effective.scope_type = 'PROJECT'
    and effective.scope_key = 'PROJECT'
    and effective.id = p_policy_version_id;

  if not found then
    return query select false, 'POLICY_NOT_CURRENT'::text, null::uuid, null::uuid, 0, 0, null::timestamptz;
    return;
  end if;
  if not v_policy.enabled then
    return query select false, 'POLICY_DISABLED'::text, null::uuid, null::uuid, 0, 0, null::timestamptz;
    return;
  end if;

  select * into v_existing_admission
  from governance.ai_resource_budget_request_admissions
  where policy_version_id = p_policy_version_id and correlation_id = p_correlation_id;
  if found then
    select * into v_existing_lease from governance.ai_resource_budget_concurrency_leases
    where admission_id = v_existing_admission.id;
    select count(*)::integer into v_request_count from governance.ai_resource_budget_request_admissions
    where policy_version_id = p_policy_version_id and admitted_at > v_now - interval '1 minute';
    select count(*)::integer into v_active_concurrency from governance.ai_resource_budget_concurrency_leases
    where policy_version_id = p_policy_version_id and released_at is null and expires_at > v_now;
    return query select true, 'ALREADY_ADMITTED'::text, v_existing_admission.id,
      case when v_existing_lease.id is null then null::uuid else v_existing_lease.id end,
      v_request_count, v_active_concurrency,
      case when v_existing_lease.id is null then null::timestamptz else v_existing_lease.expires_at end;
    return;
  end if;

  if v_policy.max_cost_usd_per_day is not null then
    select
      count(*) filter (where accounting_status <> 'PRICED'),
      count(*) filter (where accounting_status = 'PRICED' and currency <> 'USD'),
      coalesce(sum(total_cost) filter (where accounting_status = 'PRICED' and currency = 'USD'), 0)
    into v_incomplete_cost_events, v_non_usd_cost_events, v_daily_cost
    from governance.ai_model_cost_events
    where project_id = p_project_id
      and observed_at >= date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC'
      and observed_at < (date_trunc('day', v_now at time zone 'UTC') + interval '1 day') at time zone 'UTC';

    if v_incomplete_cost_events > 0 then
      return query select false, 'COST_EVIDENCE_INCOMPLETE'::text, null::uuid, null::uuid, 0, 0, null::timestamptz;
      return;
    end if;
    if v_non_usd_cost_events > 0 then
      return query select false, 'COST_CURRENCY_UNSUPPORTED'::text, null::uuid, null::uuid, 0, 0, null::timestamptz;
      return;
    end if;
    if v_daily_cost >= v_policy.max_cost_usd_per_day then
      return query select false, 'DAILY_COST_LIMIT'::text, null::uuid, null::uuid, 0, 0, null::timestamptz;
      return;
    end if;
  end if;

  if v_policy.max_requests_per_minute is not null then
    select count(*)::integer into v_request_count
    from governance.ai_resource_budget_request_admissions
    where policy_version_id = p_policy_version_id and admitted_at > v_now - interval '1 minute';
    if v_request_count >= v_policy.max_requests_per_minute then
      return query select false, 'RATE_LIMIT'::text, null::uuid, null::uuid, v_request_count, 0, null::timestamptz;
      return;
    end if;
  end if;

  if v_policy.max_concurrent_executions is not null then
    select count(*)::integer into v_active_concurrency
    from governance.ai_resource_budget_concurrency_leases
    where policy_version_id = p_policy_version_id and released_at is null and expires_at > v_now;
    if v_active_concurrency >= v_policy.max_concurrent_executions then
      return query select false, 'CONCURRENCY_LIMIT'::text, null::uuid, null::uuid, v_request_count, v_active_concurrency, null::timestamptz;
      return;
    end if;
  end if;

  insert into governance.ai_resource_budget_request_admissions(project_id, policy_version_id, correlation_id, admitted_at)
  values (p_project_id, p_policy_version_id, p_correlation_id, v_now)
  returning id into v_admission_id;
  v_request_count := v_request_count + 1;

  if v_policy.max_concurrent_executions is not null then
    v_lease_expires_at := v_now + make_interval(secs => p_lease_ttl_seconds);
    insert into governance.ai_resource_budget_concurrency_leases(
      admission_id, project_id, policy_version_id, correlation_id, acquired_at, expires_at
    ) values (v_admission_id, p_project_id, p_policy_version_id, p_correlation_id, v_now, v_lease_expires_at)
    returning id into v_lease_id;
    v_active_concurrency := v_active_concurrency + 1;
  end if;

  return query select true, 'ADMITTED'::text, v_admission_id, v_lease_id, v_request_count, v_active_concurrency, v_lease_expires_at;
end;
$$;

-- Post-invocation exact-cost enforcement. This never estimates a provider charge.
-- A per-request limit is necessarily evaluated after provider-observed usage exists, so
-- it can block consumption of the model result but cannot undo a charge already incurred.
create or replace function governance.evaluate_ai_project_runtime_cost(
  p_project_id uuid,
  p_cost_event_id uuid,
  p_policy_version_id uuid
)
returns governance.ai_runtime_cost_enforcement_decisions
language plpgsql
security definer
set search_path = pg_catalog, governance
as $$
declare
  v_event governance.ai_model_cost_events%rowtype;
  v_policy governance.ai_resource_budget_policy_versions%rowtype;
  v_existing governance.ai_runtime_cost_enforcement_decisions%rowtype;
  v_reason text := 'ALLOWED';
  v_allowed boolean := true;
  v_daily_before numeric(20,10) := 0;
  v_daily_after numeric(20,10) := 0;
  v_now timestamptz := clock_timestamp();
begin
  if p_project_id is null or p_cost_event_id is null or p_policy_version_id is null then
    raise exception 'project_id, cost_event_id, and policy_version_id are required';
  end if;

  perform pg_advisory_xact_lock(governance.ai_project_resource_budget_lock_key(p_project_id));

  select * into v_existing from governance.ai_runtime_cost_enforcement_decisions
  where cost_event_id = p_cost_event_id and policy_version_id = p_policy_version_id;
  if found then return v_existing; end if;

  select * into strict v_event from governance.ai_model_cost_events
  where id = p_cost_event_id and project_id = p_project_id;

  select versions.* into v_policy
  from governance.ai_resource_budget_policy_effective effective
  join governance.ai_resource_budget_policy_versions versions on versions.id = effective.id
  where effective.project_id = p_project_id
    and effective.scope_type = 'PROJECT'
    and effective.scope_key = 'PROJECT'
    and effective.id = p_policy_version_id;

  if not found then
    v_allowed := false; v_reason := 'POLICY_NOT_CURRENT';
  elsif not v_policy.enabled then
    v_allowed := false; v_reason := 'POLICY_DISABLED';
  elsif v_policy.max_cost_usd_per_request is null and v_policy.max_cost_usd_per_day is null then
    v_reason := 'NO_COST_LIMIT';
  elsif v_event.accounting_status <> 'PRICED' or v_event.total_cost is null or v_event.pricing_version_id is null then
    v_allowed := false; v_reason := 'COST_EVIDENCE_INCOMPLETE';
  elsif v_event.currency <> 'USD' then
    v_allowed := false; v_reason := 'COST_CURRENCY_UNSUPPORTED';
  else
    select coalesce(sum(total_cost), 0) into v_daily_after
    from governance.ai_model_cost_events
    where project_id = p_project_id
      and accounting_status = 'PRICED'
      and currency = 'USD'
      and observed_at >= date_trunc('day', v_event.observed_at at time zone 'UTC') at time zone 'UTC'
      and observed_at < (date_trunc('day', v_event.observed_at at time zone 'UTC') + interval '1 day') at time zone 'UTC';
    v_daily_before := greatest(v_daily_after - v_event.total_cost, 0);

    if v_policy.max_cost_usd_per_request is not null and v_event.total_cost > v_policy.max_cost_usd_per_request then
      v_allowed := false; v_reason := 'PER_REQUEST_COST_LIMIT';
    elsif v_policy.max_cost_usd_per_day is not null and v_daily_after > v_policy.max_cost_usd_per_day then
      v_allowed := false; v_reason := 'DAILY_COST_LIMIT';
    end if;
  end if;

  insert into governance.ai_runtime_cost_enforcement_decisions(
    project_id, cost_event_id, policy_version_id, allowed, reason,
    request_cost_usd, daily_cost_before_usd, daily_cost_after_usd,
    request_limit_usd, daily_limit_usd, evaluated_at
  ) values (
    p_project_id, p_cost_event_id, p_policy_version_id, v_allowed, v_reason,
    case when v_event.currency = 'USD' then v_event.total_cost else null end,
    case when v_event.currency = 'USD' then v_daily_before else null end,
    case when v_event.currency = 'USD' then v_daily_after else null end,
    v_policy.max_cost_usd_per_request, v_policy.max_cost_usd_per_day, v_now
  ) returning * into v_existing;

  return v_existing;
end;
$$;

revoke all on table governance.ai_runtime_cost_enforcement_decisions from public, anon;
revoke insert, update, delete on governance.ai_runtime_cost_enforcement_decisions from authenticated;
grant select on governance.ai_runtime_cost_enforcement_decisions to authenticated, service_role;
grant insert on governance.ai_runtime_cost_enforcement_decisions to service_role;

revoke all on function governance.reject_ai_runtime_cost_enforcement_decision_mutation() from public, anon, authenticated;
revoke all on function governance.evaluate_ai_project_runtime_cost(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function governance.evaluate_ai_project_runtime_cost(uuid,uuid,uuid) to service_role;

comment on table governance.ai_runtime_cost_enforcement_decisions is
  'Immutable ADR-006 runtime cost decisions bound to exact canonical model cost evidence and the exact current PROJECT/PROJECT budget policy version.';
comment on function governance.evaluate_ai_project_runtime_cost(uuid,uuid,uuid) is
  'Evaluates exact post-invocation USD cost against governed PROJECT/PROJECT limits. It never estimates usage, price, or FX and may block result consumption after the provider charge has occurred.';
comment on function governance.acquire_ai_project_resource_budget_admission(uuid,uuid,uuid,integer) is
  'Atomically enforces the exact current PROJECT/PROJECT policy. Rate and concurrency limits are checked as before; a configured daily USD hard limit also fails closed on incomplete or non-USD canonical cost evidence and denies new calls once measured daily spend reaches the limit.';

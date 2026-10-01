-- Governed prospective-learning runtime budget reservations.
-- Reservations are pessimistic and durable: each provider attempt reserves the
-- locked per-run token/USD ceilings before transport. Missing or unresolved
-- accounting never releases that reservation or authorizes another attempt.

create table if not exists agent.learning_evaluation_runtime_reservations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  policy_id uuid not null,
  candidate_id uuid not null,
  variant text not null check (variant in ('BASELINE','CANDIDATE')),
  invocation_id uuid not null,
  execution_correlation_id uuid not null,
  provider_id text not null check (provider_id = btrim(provider_id) and provider_id <> ''),
  model_name text not null check (model_name = btrim(model_name) and model_name <> ''),
  pricing_version_id uuid not null references governance.ai_model_pricing_versions(id) on delete restrict,
  reserved_cost_usd numeric not null check (reserved_cost_usd >= 0),
  reserved_tokens bigint not null check (reserved_tokens > 0),
  latency_ms_budget integer not null check (latency_ms_budget > 0),
  created_at timestamptz not null default now(),
  constraint learning_eval_runtime_reservation_policy_fk
    foreign key (policy_id, project_id)
    references agent.learning_evaluation_policies(id, project_id)
    on delete cascade,
  constraint learning_eval_runtime_reservation_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint learning_eval_runtime_reservation_invocation_uq
    unique (policy_id, invocation_id),
  constraint learning_eval_runtime_reservation_id_scope_uq
    unique (id, project_id, policy_id)
);

create index if not exists learning_eval_runtime_reservation_policy_idx
  on agent.learning_evaluation_runtime_reservations(project_id, policy_id, created_at desc);

create table if not exists agent.learning_evaluation_runtime_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  policy_id uuid not null,
  reservation_id uuid not null,
  event_sequence integer not null check (event_sequence > 0),
  event_type text not null check (event_type in ('RELEASED','RECONCILED','UNRESOLVED','EXCEEDED')),
  accounting_complete boolean not null,
  actual_cost_usd numeric check (actual_cost_usd is null or actual_cost_usd >= 0),
  actual_tokens bigint check (actual_tokens is null or actual_tokens >= 0),
  actual_latency_ms integer check (actual_latency_ms is null or actual_latency_ms >= 0),
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now(),
  constraint learning_eval_runtime_event_reservation_fk
    foreign key (reservation_id, project_id, policy_id)
    references agent.learning_evaluation_runtime_reservations(id, project_id, policy_id)
    on delete cascade,
  constraint learning_eval_runtime_event_sequence_uq unique (reservation_id, event_sequence),
  constraint learning_eval_runtime_event_shape_ck check (
    (event_type = 'RELEASED' and accounting_complete and actual_cost_usd = 0 and actual_tokens = 0 and actual_latency_ms = 0)
    or
    (event_type = 'UNRESOLVED' and accounting_complete = false)
    or
    (event_type in ('RECONCILED','EXCEEDED') and accounting_complete
      and actual_cost_usd is not null and actual_tokens is not null and actual_latency_ms is not null)
  )
);

create index if not exists learning_eval_runtime_event_policy_idx
  on agent.learning_evaluation_runtime_events(project_id, policy_id, reservation_id, event_sequence desc);

alter table agent.learning_evaluation_runtime_reservations enable row level security;
alter table agent.learning_evaluation_runtime_events enable row level security;

drop policy if exists learning_eval_runtime_reservations_project_read on agent.learning_evaluation_runtime_reservations;
create policy learning_eval_runtime_reservations_project_read
  on agent.learning_evaluation_runtime_reservations for select to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists learning_eval_runtime_events_project_read on agent.learning_evaluation_runtime_events;
create policy learning_eval_runtime_events_project_read
  on agent.learning_evaluation_runtime_events for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.learning_evaluation_runtime_reservations from public, anon, authenticated, service_role;
revoke all on agent.learning_evaluation_runtime_events from public, anon, authenticated, service_role;
grant select on agent.learning_evaluation_runtime_reservations to authenticated, service_role;
grant select on agent.learning_evaluation_runtime_events to authenticated, service_role;

drop trigger if exists reject_learning_eval_runtime_reservation_mutation on agent.learning_evaluation_runtime_reservations;
create trigger reject_learning_eval_runtime_reservation_mutation
before update or delete on agent.learning_evaluation_runtime_reservations
for each row execute function agent.reject_learning_candidate_evidence_mutation();

drop trigger if exists reject_learning_eval_runtime_event_mutation on agent.learning_evaluation_runtime_events;
create trigger reject_learning_eval_runtime_event_mutation
before update or delete on agent.learning_evaluation_runtime_events
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create or replace function agent.reserve_learning_evaluation_runtime_budget(
  p_project_id uuid,
  p_policy_id uuid,
  p_candidate_id uuid,
  p_variant text,
  p_invocation_id uuid,
  p_execution_correlation_id uuid,
  p_provider_id text,
  p_model_name text,
  p_pricing_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_policy agent.learning_evaluation_policies%rowtype;
  v_pricing governance.ai_model_pricing_effective%rowtype;
  v_cost_used numeric := 0;
  v_tokens_used numeric := 0;
  v_reservation agent.learning_evaluation_runtime_reservations%rowtype;
begin
  if p_project_id is null or p_policy_id is null or p_candidate_id is null
    or p_invocation_id is null or p_execution_correlation_id is null or p_pricing_version_id is null
  then raise exception 'project, policy, candidate, invocation, correlation and pricing identities are required'; end if;
  if p_variant not in ('BASELINE','CANDIDATE') then raise exception 'unsupported learning evaluation runtime variant'; end if;
  if nullif(btrim(coalesce(p_provider_id,'')), '') is null or nullif(btrim(coalesce(p_model_name,'')), '') is null then
    raise exception 'provider and model identities are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('learning-eval-budget:' || p_policy_id::text, 0));

  select * into v_policy
  from agent.learning_evaluation_policies
  where id = p_policy_id and project_id = p_project_id and candidate_id = p_candidate_id;
  if not found then raise exception 'learning evaluation runtime policy not found for candidate'; end if;

  if exists (
    select 1 from agent.learning_evaluation_policies newer
    where newer.project_id = v_policy.project_id
      and newer.candidate_id = v_policy.candidate_id
      and newer.id <> v_policy.id
      and newer.created_at >= v_policy.created_at
  ) then
    raise exception 'learning evaluation runtime policy is stale or chronology is ambiguous';
  end if;

  if v_policy.per_run_token_budget <= 0 or v_policy.total_token_budget <= 0 then
    raise exception 'paid learning runtime requires a positive locked token budget';
  end if;

  select * into v_pricing
  from governance.ai_model_pricing_effective
  where id = p_pricing_version_id
    and project_id = p_project_id
    and provider = btrim(p_provider_id)
    and model_id = btrim(p_model_name)
    and currency = 'USD';
  if not found then raise exception 'current USD pricing authority does not match learning runtime provider/model'; end if;

  if exists (
    select 1
    from agent.learning_evaluation_runtime_reservations r
    left join lateral (
      select e.event_type
      from agent.learning_evaluation_runtime_events e
      where e.reservation_id = r.id
      order by e.event_sequence desc
      limit 1
    ) latest on true
    where r.project_id = p_project_id
      and r.policy_id = p_policy_id
      and (
        latest.event_type in ('UNRESOLVED','EXCEEDED')
        or (
          latest.event_type is null
          and r.created_at + (r.latency_ms_budget * interval '1 millisecond') <= statement_timestamp()
        )
      )
  ) then
    raise exception 'learning evaluation runtime has unresolved or exceeded prior budget evidence';
  end if;

  select
    coalesce(sum(case
      when latest.event_type = 'RELEASED' then 0
      when latest.event_type in ('RECONCILED','EXCEEDED') then coalesce(latest.actual_cost_usd, r.reserved_cost_usd)
      else r.reserved_cost_usd end), 0),
    coalesce(sum(case
      when latest.event_type = 'RELEASED' then 0
      when latest.event_type in ('RECONCILED','EXCEEDED') then coalesce(latest.actual_tokens, r.reserved_tokens)
      else r.reserved_tokens end), 0)
  into v_cost_used, v_tokens_used
  from agent.learning_evaluation_runtime_reservations r
  left join lateral (
    select e.event_type, e.actual_cost_usd, e.actual_tokens
    from agent.learning_evaluation_runtime_events e
    where e.reservation_id = r.id
    order by e.event_sequence desc
    limit 1
  ) latest on true
  where r.project_id = p_project_id and r.policy_id = p_policy_id;

  if v_cost_used + v_policy.per_run_cost_budget > v_policy.total_cost_budget then
    raise exception 'learning evaluation total USD budget exhausted';
  end if;
  if v_tokens_used + v_policy.per_run_token_budget > v_policy.total_token_budget then
    raise exception 'learning evaluation total token budget exhausted';
  end if;

  select * into v_reservation
  from agent.learning_evaluation_runtime_reservations
  where policy_id = p_policy_id and invocation_id = p_invocation_id;
  if found then
    if v_reservation.project_id <> p_project_id
      or v_reservation.candidate_id <> p_candidate_id
      or v_reservation.variant <> p_variant
      or v_reservation.execution_correlation_id <> p_execution_correlation_id
      or v_reservation.provider_id <> btrim(p_provider_id)
      or v_reservation.model_name <> btrim(p_model_name)
      or v_reservation.pricing_version_id <> p_pricing_version_id
    then raise exception 'learning runtime invocation identity was reused with different immutable context'; end if;
    return jsonb_build_object(
      'reservationId', v_reservation.id,
      'pricingVersionId', v_reservation.pricing_version_id,
      'reservedCostUsd', v_reservation.reserved_cost_usd,
      'reservedTokens', v_reservation.reserved_tokens,
      'latencyMsBudget', v_reservation.latency_ms_budget
    );
  end if;

  insert into agent.learning_evaluation_runtime_reservations(
    project_id,policy_id,candidate_id,variant,invocation_id,execution_correlation_id,
    provider_id,model_name,pricing_version_id,reserved_cost_usd,reserved_tokens,latency_ms_budget
  ) values (
    p_project_id,p_policy_id,p_candidate_id,p_variant,p_invocation_id,p_execution_correlation_id,
    btrim(p_provider_id),btrim(p_model_name),p_pricing_version_id,
    v_policy.per_run_cost_budget,v_policy.per_run_token_budget,v_policy.latency_ms_budget
  ) returning * into v_reservation;

  return jsonb_build_object(
    'reservationId', v_reservation.id,
    'pricingVersionId', v_reservation.pricing_version_id,
    'reservedCostUsd', v_reservation.reserved_cost_usd,
    'reservedTokens', v_reservation.reserved_tokens,
    'latencyMsBudget', v_reservation.latency_ms_budget
  );
end;
$$;

revoke all on function agent.reserve_learning_evaluation_runtime_budget(uuid,uuid,uuid,text,uuid,uuid,text,text,uuid)
  from public, anon, authenticated;
grant execute on function agent.reserve_learning_evaluation_runtime_budget(uuid,uuid,uuid,text,uuid,uuid,text,text,uuid)
  to service_role;

create or replace function agent.record_learning_evaluation_runtime_event(
  p_project_id uuid,
  p_policy_id uuid,
  p_reservation_id uuid,
  p_release_without_provider_call boolean,
  p_accounting_complete boolean,
  p_actual_cost_usd numeric,
  p_actual_tokens bigint,
  p_actual_latency_ms integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_reservation agent.learning_evaluation_runtime_reservations%rowtype;
  v_latest agent.learning_evaluation_runtime_events%rowtype;
  v_event agent.learning_evaluation_runtime_events%rowtype;
  v_event_type text;
  v_sequence integer;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if p_project_id is null or p_policy_id is null or p_reservation_id is null then
    raise exception 'project, policy and reservation identities are required';
  end if;
  if v_reason = '' then raise exception 'learning runtime event reason is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('learning-eval-reservation:' || p_reservation_id::text, 0));

  select * into v_reservation
  from agent.learning_evaluation_runtime_reservations
  where id = p_reservation_id and project_id = p_project_id and policy_id = p_policy_id;
  if not found then raise exception 'learning evaluation runtime reservation not found'; end if;

  if p_release_without_provider_call then
    if p_accounting_complete is not true then raise exception 'released reservation must be complete'; end if;
    if coalesce(p_actual_cost_usd,0) <> 0 or coalesce(p_actual_tokens,0) <> 0 or coalesce(p_actual_latency_ms,0) <> 0 then
      raise exception 'released reservation cannot report provider consumption';
    end if;
    v_event_type := 'RELEASED';
    p_actual_cost_usd := 0; p_actual_tokens := 0; p_actual_latency_ms := 0;
  elsif p_accounting_complete is not true then
    v_event_type := 'UNRESOLVED';
  else
    if p_actual_cost_usd is null or p_actual_tokens is null or p_actual_latency_ms is null
      or p_actual_cost_usd < 0 or p_actual_tokens < 0 or p_actual_latency_ms < 0
    then raise exception 'complete learning runtime accounting requires non-negative cost, tokens and latency'; end if;
    if p_actual_cost_usd > v_reservation.reserved_cost_usd
      or p_actual_tokens > v_reservation.reserved_tokens
      or p_actual_latency_ms > v_reservation.latency_ms_budget
    then v_event_type := 'EXCEEDED';
    else v_event_type := 'RECONCILED';
    end if;
  end if;

  select * into v_latest
  from agent.learning_evaluation_runtime_events
  where reservation_id = p_reservation_id
  order by event_sequence desc
  limit 1;

  if found and v_latest.event_type in ('RELEASED','RECONCILED','EXCEEDED') then
    if v_latest.event_type = v_event_type
      and v_latest.accounting_complete = p_accounting_complete
      and v_latest.actual_cost_usd is not distinct from p_actual_cost_usd
      and v_latest.actual_tokens is not distinct from p_actual_tokens
      and v_latest.actual_latency_ms is not distinct from p_actual_latency_ms
    then
      return jsonb_build_object('eventId',v_latest.id,'status',v_latest.event_type,'eventSequence',v_latest.event_sequence);
    end if;
    raise exception 'learning runtime reservation already has terminal accounting evidence';
  end if;

  if found and v_latest.event_type = 'UNRESOLVED' and v_event_type = 'UNRESOLVED' then
    return jsonb_build_object('eventId',v_latest.id,'status',v_latest.event_type,'eventSequence',v_latest.event_sequence);
  end if;

  v_sequence := coalesce(v_latest.event_sequence,0) + 1;
  insert into agent.learning_evaluation_runtime_events(
    project_id,policy_id,reservation_id,event_sequence,event_type,accounting_complete,
    actual_cost_usd,actual_tokens,actual_latency_ms,reason
  ) values (
    p_project_id,p_policy_id,p_reservation_id,v_sequence,v_event_type,p_accounting_complete,
    p_actual_cost_usd,p_actual_tokens,p_actual_latency_ms,v_reason
  ) returning * into v_event;

  return jsonb_build_object('eventId',v_event.id,'status',v_event.event_type,'eventSequence',v_event.event_sequence);
end;
$$;

revoke all on function agent.record_learning_evaluation_runtime_event(uuid,uuid,uuid,boolean,boolean,numeric,bigint,integer,text)
  from public, anon, authenticated;
grant execute on function agent.record_learning_evaluation_runtime_event(uuid,uuid,uuid,boolean,boolean,numeric,bigint,integer,text)
  to service_role;

comment on table agent.learning_evaluation_runtime_reservations is
  'Append-only prospective learning runtime reservations. Full per-run ceilings are reserved atomically before provider transport; unresolved reservations remain budget-consuming.';
comment on table agent.learning_evaluation_runtime_events is
  'Append-only settlement evidence for prospective learning runtime reservations. UNRESOLVED and EXCEEDED evidence fail closed and prevent subsequent experiment calls.';

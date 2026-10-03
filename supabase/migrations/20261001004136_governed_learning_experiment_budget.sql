-- Immutable worst-case reservations. Unknown spend is never released by TTL.
create table agent.learning_experiment_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  policy_id uuid not null,
  candidate_id uuid not null,
  run_id uuid not null,
  invocation_id uuid not null unique,
  provider_id text not null,
  model_name text not null,
  pricing_version_id uuid not null references governance.ai_model_pricing_versions(id) on delete restrict,
  agent_key text not null,
  mode text not null,
  reserved_tokens bigint not null check (reserved_tokens >= 0),
  reserved_cost numeric not null check (reserved_cost >= 0 and reserved_cost <> 'NaN'::numeric and reserved_cost <> 'Infinity'::numeric),
  deadline_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, project_id),
  foreign key (policy_id, project_id) references agent.learning_evaluation_policies(id, project_id) on delete restrict,
  foreign key (candidate_id, project_id) references agent.learning_candidates(id, project_id) on delete restrict,
  check (reserved_tokens > 0 or reserved_cost > 0)
);
create index learning_experiment_budget_policy_run_idx on agent.learning_experiment_budget_reservations(policy_id, run_id);
create index learning_experiment_budget_pricing_idx on agent.learning_experiment_budget_reservations(pricing_version_id);
create index learning_experiment_budget_candidate_idx on agent.learning_experiment_budget_reservations(candidate_id, project_id);
create table agent.learning_experiment_budget_settlements (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique,
  cost_event_id uuid references governance.ai_model_cost_events(id) on delete restrict,
  project_id uuid not null,
  status text not null check (status in ('ACCOUNTED','UNKNOWN','EXCEEDED')),
  observed_tokens bigint check (observed_tokens >= 0),
  observed_cost numeric check (observed_cost >= 0 and observed_cost <> 'NaN'::numeric and observed_cost <> 'Infinity'::numeric),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (reservation_id, project_id) references agent.learning_experiment_budget_reservations(id, project_id) on delete restrict,
  check (status <> 'ACCOUNTED' or (observed_tokens is not null and observed_cost is not null))
);
create index learning_experiment_budget_cost_event_idx on agent.learning_experiment_budget_settlements(cost_event_id) where cost_event_id is not null;
alter table agent.learning_experiment_budget_reservations enable row level security;
alter table agent.learning_experiment_budget_settlements enable row level security;
revoke all on agent.learning_experiment_budget_reservations, agent.learning_experiment_budget_settlements from public, anon, authenticated, service_role;
grant select, insert on agent.learning_experiment_budget_reservations, agent.learning_experiment_budget_settlements to service_role;
-- Row locking requires UPDATE privilege; the existing immutable-policy trigger
-- still rejects every actual UPDATE or DELETE, including for service_role.
grant update on agent.learning_evaluation_policies to service_role;
create trigger learning_experiment_budget_reservations_immutable before update or delete on agent.learning_experiment_budget_reservations
for each row execute function agent.reject_learning_candidate_evidence_mutation();
create trigger learning_experiment_budget_settlements_immutable before update or delete on agent.learning_experiment_budget_settlements
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create function agent.reserve_learning_experiment_budget(
  p_project_id uuid, p_policy_id uuid, p_candidate_id uuid, p_run_id uuid,
  p_invocation_id uuid, p_agent_key text, p_mode text,
  p_reserved_tokens bigint, p_reserved_cost numeric,
  p_provider_id text default null, p_model_name text default null, p_pricing_version_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, agent as $$
declare
  v_policy agent.learning_evaluation_policies%rowtype;
  v_id uuid;
  v_deadline timestamptz;
  v_total_tokens numeric;
  v_total_cost numeric;
  v_run_tokens numeric;
  v_run_cost numeric;
  v_pricing governance.ai_model_pricing_versions%rowtype;
  v_pricing_matches integer;
  v_now timestamptz;
begin
  if p_project_id is null or p_policy_id is null or p_candidate_id is null or p_run_id is null or p_invocation_id is null
    or p_agent_key is null or p_mode is null or p_reserved_tokens is null or p_reserved_cost is null
    or nullif(btrim(p_provider_id),'') is null or nullif(btrim(p_model_name),'') is null or p_pricing_version_id is null
    or p_reserved_tokens < 0 or p_reserved_cost < 0 or p_reserved_cost in ('NaN'::numeric, 'Infinity'::numeric)
    or (p_reserved_tokens = 0 and p_reserved_cost = 0) then
    return jsonb_build_object('admitted',false,'reason','INVALID_RESERVATION');
  end if;
  select * into v_policy from agent.learning_evaluation_policies
    where id = p_policy_id and project_id = p_project_id for update;
  if not found then return jsonb_build_object('admitted',false,'reason','POLICY_NOT_FOUND'); end if;
  if v_policy.candidate_id <> p_candidate_id or v_policy.agent_key <> p_agent_key or v_policy.mode <> p_mode then
    return jsonb_build_object('admitted',false,'reason','POLICY_BINDING_MISMATCH');
  end if;
  if v_policy.total_cost_budget in ('NaN'::numeric,'Infinity'::numeric) or v_policy.per_run_cost_budget in ('NaN'::numeric,'Infinity'::numeric) then
    return jsonb_build_object('admitted',false,'reason','POLICY_INVALID');
  end if;
  if v_policy.locked_at > clock_timestamp() or exists (
    select 1 from agent.learning_evaluation_policies p where p.project_id = p_project_id and p.candidate_id = p_candidate_id
      and p.id <> p_policy_id and p.created_at >= v_policy.created_at
  ) then return jsonb_build_object('admitted',false,'reason','POLICY_NOT_CURRENT'); end if;
  if exists (select 1 from agent.learning_experiment_budget_reservations where invocation_id = p_invocation_id) then
    return jsonb_build_object('admitted',false,'reason','INVOCATION_ALREADY_RESERVED');
  end if;
  if exists (
    select 1 from agent.learning_experiment_budget_reservations r
    join agent.learning_experiment_budget_settlements s on s.reservation_id = r.id
    where r.policy_id = p_policy_id and s.status <> 'ACCOUNTED'
  ) then return jsonb_build_object('admitted',false,'reason','ACCOUNTING_UNSAFE'); end if;
  select min(deadline_at) into v_deadline from agent.learning_experiment_budget_reservations
    where policy_id = p_policy_id and run_id = p_run_id;
  if v_deadline is null then v_deadline := clock_timestamp() + v_policy.latency_ms_budget * interval '1 millisecond'; end if;
  if clock_timestamp() >= v_deadline then return jsonb_build_object('admitted',false,'reason','RUN_DEADLINE_EXCEEDED'); end if;
  select coalesce(sum(case when s.status = 'ACCOUNTED' then s.observed_tokens else r.reserved_tokens end),0),
    coalesce(sum(case when s.status = 'ACCOUNTED' then s.observed_cost else r.reserved_cost end),0),
    coalesce(sum(case when r.run_id = p_run_id then case when s.status = 'ACCOUNTED' then s.observed_tokens else r.reserved_tokens end else 0 end),0),
    coalesce(sum(case when r.run_id = p_run_id then case when s.status = 'ACCOUNTED' then s.observed_cost else r.reserved_cost end else 0 end),0)
    into v_total_tokens,v_total_cost,v_run_tokens,v_run_cost
    from agent.learning_experiment_budget_reservations r left join agent.learning_experiment_budget_settlements s on s.reservation_id = r.id
    where r.policy_id = p_policy_id;
  if v_run_tokens + p_reserved_tokens > v_policy.per_run_token_budget or v_run_cost + p_reserved_cost > v_policy.per_run_cost_budget then
    return jsonb_build_object('admitted',false,'reason','RUN_BUDGET_EXCEEDED');
  end if;
  if v_total_tokens + p_reserved_tokens > v_policy.total_token_budget or v_total_cost + p_reserved_cost > v_policy.total_cost_budget then
    return jsonb_build_object('admitted',false,'reason','TOTAL_BUDGET_EXCEEDED');
  end if;
  -- Mirror canonical accounting's project-specific resolution and ambiguity
  -- refusal. Authority rows already carry human review evidence, not a status.
  v_now := clock_timestamp();
  select count(*) into v_pricing_matches from governance.ai_model_pricing_versions q
    where q.project_id = p_project_id and q.provider = lower(btrim(p_provider_id))
      and q.model_id = btrim(p_model_name) and q.effective_from <= v_now
      and (q.effective_to is null or q.effective_to > v_now);
  select * into v_pricing from governance.ai_model_pricing_versions where id = p_pricing_version_id;
  if not found or v_pricing_matches <> 1 or v_pricing.project_id <> p_project_id
    or v_pricing.provider <> btrim(p_provider_id) or v_pricing.model_id <> btrim(p_model_name)
    or v_pricing.currency <> 'USD' or v_pricing.effective_from > v_now
    or (v_pricing.effective_to is not null and v_pricing.effective_to <= v_now)
    or v_pricing.reviewed_by is null or v_pricing.reviewed_at is null
    or v_pricing.reviewed_at > v_now or v_pricing.reviewer_capability <> 'policy.approve'
    or v_pricing.created_by is distinct from v_pricing.reviewed_by
    or v_pricing.input_price_per_million_tokens < 0 or v_pricing.output_price_per_million_tokens < 0
    or v_pricing.input_price_per_million_tokens in ('NaN'::numeric,'Infinity'::numeric)
    or v_pricing.output_price_per_million_tokens in ('NaN'::numeric,'Infinity'::numeric)
    or exists (select 1 from governance.ai_model_pricing_versions q
      where q.project_id = p_project_id and q.provider = v_pricing.provider and q.model_id = v_pricing.model_id
        and q.id <> v_pricing.id and q.effective_from <= v_now
        and (q.effective_from > v_pricing.effective_from or
          (q.effective_from = v_pricing.effective_from and q.created_at >= v_pricing.created_at)))
  then return jsonb_build_object('admitted',false,'reason','PRICING_UNSAFE'); end if;
  insert into agent.learning_experiment_budget_reservations(project_id,policy_id,candidate_id,run_id,invocation_id,agent_key,mode,reserved_tokens,reserved_cost,deadline_at,provider_id,model_name,pricing_version_id)
    values(p_project_id,p_policy_id,p_candidate_id,p_run_id,p_invocation_id,p_agent_key,p_mode,p_reserved_tokens,p_reserved_cost,v_deadline,btrim(p_provider_id),btrim(p_model_name),p_pricing_version_id) returning id into v_id;
  return jsonb_build_object('admitted',true,'reason','ADMITTED','reservation_id',v_id,'deadline_at',v_deadline);
exception when unique_violation then
  return jsonb_build_object('admitted',false,'reason','INVOCATION_ALREADY_RESERVED');
end $$;

create function agent.reconcile_learning_experiment_budget(
  p_project_id uuid, p_reservation_id uuid, p_observed_tokens bigint,
  p_observed_cost numeric, p_accounting_complete boolean, p_cost_event_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, agent as $$
declare
  v_reservation agent.learning_experiment_budget_reservations%rowtype;
  v_status text;
  v_existing agent.learning_experiment_budget_settlements%rowtype;
  v_event governance.ai_model_cost_events%rowtype;
  v_event_valid boolean := false;
begin
  select * into v_reservation from agent.learning_experiment_budget_reservations where id = p_reservation_id and project_id = p_project_id;
  if not found then return jsonb_build_object('status','REJECTED','reason','RESERVATION_NOT_FOUND'); end if;
  perform 1 from agent.learning_evaluation_policies where id = v_reservation.policy_id and project_id = p_project_id for update;
  select * into v_existing from agent.learning_experiment_budget_settlements where reservation_id = p_reservation_id;
  if found then
    if v_existing.observed_tokens is distinct from p_observed_tokens
      or v_existing.observed_cost is distinct from p_observed_cost
      or v_existing.cost_event_id is distinct from p_cost_event_id then
      return jsonb_build_object('status','REJECTED','reason','RECONCILIATION_CONFLICT');
    end if;
    return jsonb_build_object('status',v_existing.status,'reason','ALREADY_RECONCILED');
  end if;
  if p_cost_event_id is not null then
    select * into v_event from governance.ai_model_cost_events where id = p_cost_event_id;
    v_event_valid := found and v_event.invocation_id = v_reservation.invocation_id
      and v_event.project_id = p_project_id and v_event.execution_correlation_id = v_reservation.run_id
      and v_event.provider_id = v_reservation.provider_id and v_event.model_name = v_reservation.model_name
      and v_event.pricing_version_id = v_reservation.pricing_version_id
      and v_event.accounting_status = 'PRICED' and v_event.currency = 'USD'
      and v_event.input_tokens >= 0 and v_event.output_tokens >= 0
      and v_event.total_tokens::numeric = v_event.input_tokens::numeric + v_event.output_tokens::numeric
      and v_event.total_tokens = p_observed_tokens and v_event.total_cost = p_observed_cost
      and v_event.total_cost = v_event.input_cost + v_event.output_cost
      and v_event.observed_at >= v_reservation.created_at
      and v_event.total_cost not in ('NaN'::numeric,'Infinity'::numeric);
  end if;
  if p_accounting_complete is not true or v_event_valid is not true then v_status := 'UNKNOWN';
  elsif p_observed_tokens > v_reservation.reserved_tokens or p_observed_cost > v_reservation.reserved_cost then v_status := 'EXCEEDED';
  else v_status := 'ACCOUNTED'; end if;
  insert into agent.learning_experiment_budget_settlements(reservation_id,project_id,status,observed_tokens,observed_cost,cost_event_id)
    values(p_reservation_id,p_project_id,v_status,case when p_observed_tokens >= 0 then p_observed_tokens end,case when p_observed_cost >= 0 and p_observed_cost not in ('NaN'::numeric,'Infinity'::numeric) then p_observed_cost end,case when v_event.id is not null then v_event.id end);
  return jsonb_build_object('status',v_status,'reason',v_status);
end $$;
revoke all on function agent.reserve_learning_experiment_budget(uuid,uuid,uuid,uuid,uuid,text,text,bigint,numeric,text,text,uuid) from public, anon, authenticated;
revoke all on function agent.reconcile_learning_experiment_budget(uuid,uuid,bigint,numeric,boolean,uuid) from public, anon, authenticated;
grant execute on function agent.reserve_learning_experiment_budget(uuid,uuid,uuid,uuid,uuid,text,text,bigint,numeric,text,text,uuid) to service_role;
grant execute on function agent.reconcile_learning_experiment_budget(uuid,uuid,bigint,numeric,boolean,uuid) to service_role;
comment on table agent.learning_experiment_budget_reservations is 'Immutable worst-case experiment bounds, retained until complete accounting. No timeout refund.';
comment on table agent.learning_experiment_budget_settlements is 'Immutable accounting evidence. UNKNOWN and EXCEEDED block all further policy calls.';

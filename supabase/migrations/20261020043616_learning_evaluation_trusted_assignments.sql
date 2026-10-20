-- Trusted evaluator identity and acknowledgement for prospective results.
-- Legacy policies remain unchanged and cannot receive results without a matching
-- UUID-backed assignment and acknowledgement.

create table if not exists agent.learning_evaluation_assignments (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null,
  project_id uuid not null,
  candidate_id uuid not null,
  proposer_user_id uuid not null references auth.users(id) on delete restrict,
  evaluator_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  scope_digest text not null check (scope_digest ~ '^sha256:[0-9a-f]{64}$'),
  assigned_at timestamptz not null default now(),
  constraint learning_evaluation_assignment_policy_uq unique (policy_id),
  constraint learning_evaluation_assignment_scope_uq unique
    (id, policy_id, project_id, candidate_id, evaluator_user_id, scope_digest),
  constraint learning_evaluation_assignment_policy_fk
    foreign key (policy_id, project_id)
    references agent.learning_evaluation_policies(id, project_id) on delete restrict,
  constraint learning_evaluation_assignment_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id) on delete restrict,
  constraint learning_evaluation_assignment_distinct_users_ck
    check (proposer_user_id <> evaluator_user_id),
  constraint learning_evaluation_assignment_assigner_ck
    check (assigned_by_user_id = proposer_user_id)
);

create index if not exists learning_evaluation_assignments_evaluator_idx
  on agent.learning_evaluation_assignments(project_id, evaluator_user_id, assigned_at desc);

create table if not exists agent.learning_evaluation_assignment_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  policy_id uuid not null,
  project_id uuid not null,
  candidate_id uuid not null,
  evaluator_user_id uuid not null references auth.users(id) on delete restrict,
  scope_digest text not null check (scope_digest ~ '^sha256:[0-9a-f]{64}$'),
  acknowledged_by_user_id uuid not null references auth.users(id) on delete restrict,
  acknowledged_at timestamptz not null default now(),
  constraint learning_evaluation_assignment_ack_policy_uq unique (policy_id),
  constraint learning_evaluation_assignment_ack_user_ck
    check (acknowledged_by_user_id = evaluator_user_id),
  constraint learning_evaluation_assignment_ack_assignment_fk
    foreign key (assignment_id, policy_id, project_id, candidate_id, evaluator_user_id, scope_digest)
    references agent.learning_evaluation_assignments
      (id, policy_id, project_id, candidate_id, evaluator_user_id, scope_digest)
    on delete restrict
);

alter table agent.learning_evaluation_assignments enable row level security;
alter table agent.learning_evaluation_assignment_acknowledgements enable row level security;
revoke all on agent.learning_evaluation_assignments from public, anon, authenticated, service_role;
revoke all on agent.learning_evaluation_assignment_acknowledgements from public, anon, authenticated, service_role;
grant select on agent.learning_evaluation_assignments to service_role;
grant select on agent.learning_evaluation_assignment_acknowledgements to service_role;

create trigger reject_learning_evaluation_assignment_mutation
before update or delete on agent.learning_evaluation_assignments
for each row execute function agent.reject_learning_candidate_evidence_mutation();
create trigger reject_learning_evaluation_assignment_ack_mutation
before update or delete on agent.learning_evaluation_assignment_acknowledgements
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create or replace function agent.record_learning_evaluation_assignment(
  p_policy_id uuid,
  p_project_id uuid,
  p_candidate_id uuid,
  p_proposer_user_id uuid,
  p_evaluator_user_id uuid,
  p_assigned_by_user_id uuid
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, agent, app
as $$
declare
  v_policy agent.learning_evaluation_policies%rowtype;
  v_id uuid;
  v_digest text;
  v_existing agent.learning_evaluation_assignments%rowtype;
begin
  if p_policy_id is null or p_project_id is null or p_candidate_id is null
    or p_proposer_user_id is null or p_evaluator_user_id is null or p_assigned_by_user_id is null then
    raise exception 'assignment identity and scope are required';
  end if;
  if p_proposer_user_id = p_evaluator_user_id or p_assigned_by_user_id <> p_proposer_user_id then
    raise exception 'proposer and evaluator must be distinct and proposer must assign';
  end if;

  select * into v_policy
  from agent.learning_evaluation_policies
  where id = p_policy_id and project_id = p_project_id and candidate_id = p_candidate_id
  for share;
  if not found then raise exception 'locked evaluation policy not found for assignment'; end if;
  if lower(btrim(v_policy.proposer_actor_id)) <> p_proposer_user_id::text
    or lower(btrim(v_policy.evaluator_actor_id)) <> p_evaluator_user_id::text then
    raise exception 'policy actors do not match authenticated assignment identities';
  end if;

  v_digest := 'sha256:' || encode(extensions.digest(convert_to(to_jsonb(v_policy)::text, 'UTF8'), 'sha256'), 'hex');
  insert into agent.learning_evaluation_assignments(
    policy_id, project_id, candidate_id, proposer_user_id, evaluator_user_id,
    assigned_by_user_id, scope_digest
  ) values (
    p_policy_id, p_project_id, p_candidate_id, p_proposer_user_id, p_evaluator_user_id,
    p_assigned_by_user_id, v_digest
  ) on conflict (policy_id) do nothing returning id into v_id;

  if v_id is null then
    select * into v_existing from agent.learning_evaluation_assignments where policy_id = p_policy_id;
    if not found or v_existing.project_id <> p_project_id or v_existing.candidate_id <> p_candidate_id
      or v_existing.proposer_user_id <> p_proposer_user_id or v_existing.evaluator_user_id <> p_evaluator_user_id
      or v_existing.assigned_by_user_id <> p_assigned_by_user_id or v_existing.scope_digest <> v_digest then
      raise exception 'existing evaluator assignment does not match locked policy';
    end if;
    v_id := v_existing.id;
  end if;
  return v_id;
end;
$$;

revoke all on function agent.record_learning_evaluation_assignment(uuid,uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function agent.record_learning_evaluation_assignment(uuid,uuid,uuid,uuid,uuid,uuid)
  to service_role;

create or replace function agent.record_learning_evaluation_assignment_acknowledgement(
  p_policy_id uuid,
  p_project_id uuid,
  p_evaluator_user_id uuid
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, agent
as $$
declare
  v_assignment agent.learning_evaluation_assignments%rowtype;
  v_ack_id uuid;
  v_existing agent.learning_evaluation_assignment_acknowledgements%rowtype;
begin
  select * into v_assignment from agent.learning_evaluation_assignments
  where policy_id = p_policy_id and project_id = p_project_id and evaluator_user_id = p_evaluator_user_id;
  if not found then raise exception 'matching evaluator assignment not found'; end if;

  insert into agent.learning_evaluation_assignment_acknowledgements(
    assignment_id, policy_id, project_id, candidate_id, evaluator_user_id,
    scope_digest, acknowledged_by_user_id
  ) values (
    v_assignment.id, v_assignment.policy_id, v_assignment.project_id, v_assignment.candidate_id,
    v_assignment.evaluator_user_id, v_assignment.scope_digest, p_evaluator_user_id
  ) on conflict (policy_id) do nothing returning id into v_ack_id;

  if v_ack_id is null then
    select * into v_existing from agent.learning_evaluation_assignment_acknowledgements
    where policy_id = p_policy_id;
    if not found or v_existing.assignment_id <> v_assignment.id
      or v_existing.evaluator_user_id <> p_evaluator_user_id
      or v_existing.scope_digest <> v_assignment.scope_digest then
      raise exception 'existing evaluator acknowledgement does not match assignment';
    end if;
    v_ack_id := v_existing.id;
  end if;
  return v_ack_id;
end;
$$;

revoke all on function agent.record_learning_evaluation_assignment_acknowledgement(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function agent.record_learning_evaluation_assignment_acknowledgement(uuid,uuid,uuid)
  to service_role;

create or replace function agent.require_acknowledged_learning_evaluator()
returns trigger language plpgsql security definer
set search_path = pg_catalog, agent
as $$
declare
  v_ack agent.learning_evaluation_assignment_acknowledgements%rowtype;
begin
  select ack.* into v_ack
  from agent.learning_evaluation_assignment_acknowledgements ack
  where ack.policy_id = new.policy_id and ack.project_id = new.project_id
    and ack.candidate_id = new.candidate_id and ack.evaluator_user_id::text = new.recorded_by;
  if not found then raise exception 'acknowledged evaluator assignment is required before result recording'; end if;
  return new;
end;
$$;

revoke all on function agent.require_acknowledged_learning_evaluator() from public, anon, authenticated, service_role;
create trigger require_acknowledged_learning_evaluator
before insert on agent.learning_evaluation_results
for each row execute function agent.require_acknowledged_learning_evaluator();

comment on table agent.learning_evaluation_assignments is
  'Append-only UUID-backed assignment binding proposer, evaluator, locked policy scope, and assignment authority.';
comment on table agent.learning_evaluation_assignment_acknowledgements is
  'Append-only acknowledgement by the assigned evaluator, bound to the assignment scope digest.';

-- Fence interrupted autonomous recovery work with explicit leases and replay contracts.
-- Stale work is reclaimable only when the registered handler explicitly declares replay safety.

alter table orchestration.recovery_actions
  add column if not exists execution_token uuid null,
  add column if not exists execution_lease_expires_at timestamptz null,
  add column if not exists replay_contract_version integer null,
  add column if not exists replay_safe boolean null;

alter table orchestration.recovery_actions
  drop constraint if exists recovery_actions_status_check,
  add constraint recovery_actions_status_check
    check (status in ('EXECUTED', 'QUEUED', 'REQUESTED', 'RUNNING', 'REJECTED')),
  drop constraint if exists recovery_actions_replay_contract_version_check,
  add constraint recovery_actions_replay_contract_version_check
    check (replay_contract_version is null or replay_contract_version > 0);

create index if not exists recovery_actions_running_lease_idx
  on orchestration.recovery_actions(execution_lease_expires_at)
  where action_type = 'AUTO_REPAIR' and status = 'RUNNING';

create or replace function orchestration.claim_execution_recovery_auto_repair(
  p_case_id uuid,
  p_repair_attempt integer,
  p_action_key text,
  p_mutation_scope text,
  p_replay_contract_version integer,
  p_replay_safe boolean,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case orchestration.recovery_cases%rowtype;
  v_action orchestration.recovery_actions%rowtype;
  v_action_id uuid;
  v_execution_token uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 300), 3600));
begin
  if p_repair_attempt < 0 then
    raise exception 'Repair attempt must be non-negative.' using errcode = '22023';
  end if;
  if p_replay_contract_version is null or p_replay_contract_version <= 0 then
    return jsonb_build_object('claimed', false, 'reason', 'REPLAY_CONTRACT_VERSION_REQUIRED');
  end if;

  select * into v_case
  from orchestration.recovery_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Recovery case not found.' using errcode = 'P0002';
  end if;
  if v_case.severity not in ('P0', 'P1') then
    return jsonb_build_object('claimed', false, 'reason', 'SEVERITY_NOT_AUTOREPAIRABLE');
  end if;
  if v_case.authorization_decision is distinct from 'AUTHORIZED' then
    return jsonb_build_object('claimed', false, 'reason', 'REPAIR_NOT_AUTHORIZED');
  end if;
  if v_case.retry_attempt <> p_repair_attempt then
    return jsonb_build_object('claimed', false, 'reason', 'REPAIR_ATTEMPT_MISMATCH');
  end if;
  if v_case.final_outcome <> 'OPEN' then
    return jsonb_build_object('claimed', false, 'reason', 'CASE_ALREADY_TERMINAL');
  end if;

  select * into v_action
  from orchestration.recovery_actions
  where recovery_case_id = p_case_id
    and action_type = 'AUTO_REPAIR'
    and repair_attempt = p_repair_attempt
  limit 1
  for update;

  if found then
    if v_action.status = 'EXECUTED' then
      return jsonb_build_object('claimed', false, 'reason', 'ATTEMPT_ALREADY_EXECUTED');
    end if;

    if v_action.status <> 'RUNNING' then
      return jsonb_build_object('claimed', false, 'reason', 'LEGACY_OR_UNKNOWN_INFLIGHT_STATE');
    end if;

    if v_action.execution_lease_expires_at is null or v_action.execution_lease_expires_at > v_now then
      return jsonb_build_object('claimed', false, 'reason', 'ATTEMPT_IN_FLIGHT');
    end if;

    if v_action.replay_contract_version is distinct from p_replay_contract_version then
      update orchestration.recovery_cases
         set status = 'AWAITING_MANUAL_REVIEW',
             final_outcome = 'ESCALATED',
             escalation_reason = 'REPLAY_CONTRACT_VERSION_MISMATCH',
             updated_at = v_now
       where id = p_case_id;
      return jsonb_build_object('claimed', false, 'reason', 'REPLAY_CONTRACT_VERSION_MISMATCH');
    end if;

    if v_action.replay_safe is distinct from true or p_replay_safe is distinct from true then
      update orchestration.recovery_cases
         set status = 'AWAITING_MANUAL_REVIEW',
             final_outcome = 'ESCALATED',
             escalation_reason = 'STALE_ATTEMPT_REPLAY_UNSAFE',
             updated_at = v_now
       where id = p_case_id;
      return jsonb_build_object('claimed', false, 'reason', 'STALE_ATTEMPT_REPLAY_UNSAFE');
    end if;

    update orchestration.recovery_actions
       set execution_token = v_execution_token,
           execution_lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
           outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object(
             'reclaimed_at', v_now,
             'previous_execution_token', v_action.execution_token,
             'replay_contract_version', p_replay_contract_version
           )
     where id = v_action.id
    returning id into v_action_id;

    return jsonb_build_object(
      'claimed', true,
      'reclaimed', true,
      'action_id', v_action_id,
      'execution_token', v_execution_token,
      'lease_expires_at', v_now + make_interval(secs => v_lease_seconds)
    );
  end if;

  insert into orchestration.recovery_actions (
    recovery_case_id, project_id, action_type, consent_source, status, repair_attempt,
    execution_token, execution_lease_expires_at, replay_contract_version, replay_safe, outcome
  ) values (
    v_case.id, v_case.project_id, 'AUTO_REPAIR', 'SYSTEM', 'RUNNING', p_repair_attempt,
    v_execution_token, v_now + make_interval(secs => v_lease_seconds),
    p_replay_contract_version, p_replay_safe,
    jsonb_build_object(
      'action_key', p_action_key,
      'mutation_scope', p_mutation_scope,
      'claimed_at', v_now,
      'replay_contract_version', p_replay_contract_version,
      'replay_safe', p_replay_safe
    )
  ) returning id into v_action_id;

  return jsonb_build_object(
    'claimed', true,
    'reclaimed', false,
    'action_id', v_action_id,
    'execution_token', v_execution_token,
    'lease_expires_at', v_now + make_interval(secs => v_lease_seconds)
  );
exception when unique_violation then
  return jsonb_build_object('claimed', false, 'reason', 'ATTEMPT_IN_FLIGHT');
end;
$function$;

create or replace function orchestration.claim_execution_recovery_auto_repair(
  p_case_id uuid,
  p_repair_attempt integer,
  p_action_key text,
  p_mutation_scope text
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select jsonb_build_object('claimed', false, 'reason', 'REPLAY_METADATA_REQUIRED');
$function$;

create or replace function orchestration.finalize_execution_recovery_auto_repair(
  p_case_id uuid,
  p_repair_attempt integer,
  p_mutation_id text,
  p_repair_applied boolean,
  p_validation_result text,
  p_validation_code text
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select jsonb_build_object('finalized', false, 'reason', 'EXECUTION_FENCE_TOKEN_REQUIRED');
$function$;

create or replace function orchestration.finalize_execution_recovery_auto_repair(
  p_case_id uuid,
  p_repair_attempt integer,
  p_execution_token uuid,
  p_mutation_id text,
  p_repair_applied boolean,
  p_validation_result text,
  p_validation_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case orchestration.recovery_cases%rowtype;
  v_repair_action orchestration.recovery_actions%rowtype;
  v_validation_action_id uuid;
  v_validation text := upper(trim(coalesce(p_validation_result, 'NOT_RUN')));
begin
  if v_validation not in ('NOT_RUN', 'PASSED', 'FAILED') then
    raise exception 'Unsupported recovery validation result: %', v_validation using errcode = '22023';
  end if;

  select * into v_case
  from orchestration.recovery_cases
  where id = p_case_id
  for update;
  if not found then
    raise exception 'Recovery case not found.' using errcode = 'P0002';
  end if;

  select * into v_repair_action
  from orchestration.recovery_actions
  where recovery_case_id = p_case_id
    and action_type = 'AUTO_REPAIR'
    and repair_attempt = p_repair_attempt
  limit 1
  for update;

  if not found then
    raise exception 'Autonomous repair claim evidence is missing.' using errcode = '23514';
  end if;
  if v_repair_action.status <> 'RUNNING' then
    raise exception 'Autonomous repair action is not actively running.' using errcode = '55000';
  end if;
  if v_repair_action.execution_token is distinct from p_execution_token then
    raise exception 'Autonomous repair execution token is stale.' using errcode = '55000';
  end if;

  update orchestration.recovery_actions
     set status = 'EXECUTED',
         executed_at = coalesce(executed_at, now()),
         execution_lease_expires_at = null,
         outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object(
           'repair_applied', p_repair_applied,
           'mutation_id', nullif(trim(coalesce(p_mutation_id, '')), ''),
           'repair_completed_at', now()
         )
   where id = v_repair_action.id;

  if v_validation in ('PASSED', 'FAILED') then
    insert into orchestration.recovery_actions (
      recovery_case_id, project_id, action_type, consent_source, status, repair_attempt, outcome, executed_at
    ) values (
      v_case.id, v_case.project_id, 'VALIDATE', 'SYSTEM', 'EXECUTED', p_repair_attempt,
      jsonb_build_object(
        'validation_result', v_validation,
        'validation_code', nullif(trim(coalesce(p_validation_code, '')), ''),
        'validated_at', now()
      ),
      now()
    )
    on conflict do nothing
    returning id into v_validation_action_id;

    if v_validation_action_id is null then
      select id into v_validation_action_id
      from orchestration.recovery_actions
      where recovery_case_id = p_case_id
        and action_type = 'VALIDATE'
        and repair_attempt = p_repair_attempt
      limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'repair_action_id', v_repair_action.id,
    'validation_action_id', v_validation_action_id,
    'validation_result', v_validation
  );
end;
$function$;

revoke all on function orchestration.claim_execution_recovery_auto_repair(uuid, integer, text, text, integer, boolean, integer)
  from public, anon, authenticated;
revoke all on function orchestration.claim_execution_recovery_auto_repair(uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function orchestration.finalize_execution_recovery_auto_repair(uuid, integer, text, boolean, text, text)
  from public, anon, authenticated;
revoke all on function orchestration.finalize_execution_recovery_auto_repair(uuid, integer, uuid, text, boolean, text, text)
  from public, anon, authenticated;

grant execute on function orchestration.claim_execution_recovery_auto_repair(uuid, integer, text, text, integer, boolean, integer)
  to service_role;
grant execute on function orchestration.finalize_execution_recovery_auto_repair(uuid, integer, uuid, text, boolean, text, text)
  to service_role;
grant execute on function orchestration.queue_execution_recovery_resume(uuid, integer, text, text)
  to service_role;

comment on function orchestration.claim_execution_recovery_auto_repair(uuid, integer, text, text, integer, boolean, integer) is
  'Internal fenced claim for one autonomous repair executor; stale work is reclaimable only with an exact replay contract and explicit replay safety.';
comment on function orchestration.finalize_execution_recovery_auto_repair(uuid, integer, uuid, text, boolean, text, text) is
  'Finalizes autonomous recovery only for the currently fenced execution token, preventing stale workers from committing evidence after reclaim.';

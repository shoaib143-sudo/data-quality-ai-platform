-- Add atomic repair-attempt claims for the existing Execution Recovery Agent.
-- This prevents duplicate mutations when the same recovery event is replayed or raced.

alter table orchestration.recovery_actions
  add column if not exists repair_attempt integer null;

alter table orchestration.recovery_actions
  drop constraint if exists recovery_actions_repair_attempt_check,
  add constraint recovery_actions_repair_attempt_check
    check (repair_attempt is null or repair_attempt >= 0);

create unique index if not exists recovery_actions_one_auto_repair_attempt_idx
  on orchestration.recovery_actions(recovery_case_id, repair_attempt)
  where action_type = 'AUTO_REPAIR';

create or replace function orchestration.claim_execution_recovery_auto_repair(
  p_case_id uuid,
  p_repair_attempt integer,
  p_action_key text,
  p_mutation_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case orchestration.recovery_cases%rowtype;
  v_action_id uuid;
begin
  if p_repair_attempt < 0 then
    raise exception 'Repair attempt must be non-negative.' using errcode = '22023';
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

  begin
    insert into orchestration.recovery_actions (
      recovery_case_id, project_id, action_type, consent_source, status, repair_attempt, outcome
    ) values (
      v_case.id,
      v_case.project_id,
      'AUTO_REPAIR',
      'SYSTEM',
      'REQUESTED',
      p_repair_attempt,
      jsonb_build_object(
        'action_key', p_action_key,
        'mutation_scope', p_mutation_scope,
        'claimed_at', now()
      )
    ) returning id into v_action_id;
  exception when unique_violation then
    return jsonb_build_object('claimed', false, 'reason', 'ATTEMPT_ALREADY_CLAIMED');
  end;

  return jsonb_build_object('claimed', true, 'action_id', v_action_id);
end;
$function$;

revoke all on function orchestration.claim_execution_recovery_auto_repair(uuid, integer, text, text)
  from public, anon, authenticated;

comment on function orchestration.claim_execution_recovery_auto_repair(uuid, integer, text, text) is
  'Internal atomic claim for one autonomous P0/P1 repair mutation per recovery case and bounded attempt.';

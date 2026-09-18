-- Persist repair and validation evidence for each bounded autonomous attempt.

create unique index if not exists recovery_actions_one_validation_per_attempt_idx
  on orchestration.recovery_actions(recovery_case_id, repair_attempt)
  where action_type = 'VALIDATE';

create or replace function orchestration.finalize_execution_recovery_auto_repair(
  p_case_id uuid,
  p_repair_attempt integer,
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
  v_repair_action_id uuid;
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

  select id into v_repair_action_id
  from orchestration.recovery_actions
  where recovery_case_id = p_case_id
    and action_type = 'AUTO_REPAIR'
    and repair_attempt = p_repair_attempt
  limit 1
  for update;

  if v_repair_action_id is null then
    raise exception 'Autonomous repair claim evidence is missing.' using errcode = '23514';
  end if;

  update orchestration.recovery_actions
     set status = 'EXECUTED',
         executed_at = coalesce(executed_at, now()),
         outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object(
           'repair_applied', p_repair_applied,
           'mutation_id', nullif(trim(coalesce(p_mutation_id, '')), ''),
           'repair_completed_at', now()
         )
   where id = v_repair_action_id;

  if v_validation in ('PASSED', 'FAILED') then
    insert into orchestration.recovery_actions (
      recovery_case_id, project_id, action_type, consent_source, status, repair_attempt, outcome, executed_at
    ) values (
      v_case.id,
      v_case.project_id,
      'VALIDATE',
      'SYSTEM',
      'EXECUTED',
      p_repair_attempt,
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
    'repair_action_id', v_repair_action_id,
    'validation_action_id', v_validation_action_id,
    'validation_result', v_validation
  );
end;
$function$;

revoke all on function orchestration.finalize_execution_recovery_auto_repair(uuid, integer, text, boolean, text, text)
  from public, anon, authenticated;

comment on function orchestration.finalize_execution_recovery_auto_repair(uuid, integer, text, boolean, text, text) is
  'Internal audit finalizer for one claimed autonomous repair and its independent validation evidence.';

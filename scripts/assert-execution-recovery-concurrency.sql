do $do$
declare
  v_count integer;
  v_project_a uuid := '30000000-0000-4000-8000-000000000001';
  v_project_b uuid := '30000000-0000-4000-8000-000000000002';
begin
  select count(*) into v_count
  from orchestration.recovery_actions
  where recovery_case_id = '30000000-0000-4000-8000-000000000011'
    and action_type = 'AUTO_REPAIR'
    and repair_attempt = 0;
  if v_count <> 1 then
    raise exception 'Concurrent replay created % repair claims for one case/attempt.', v_count;
  end if;

  select count(*) into v_count
  from orchestration.recovery_actions a
  join orchestration.recovery_cases c on c.id = a.recovery_case_id
  where c.id in (
    '30000000-0000-4000-8000-000000000021',
    '30000000-0000-4000-8000-000000000031'
  )
    and a.action_type = 'AUTO_REPAIR'
    and a.project_id = c.project_id;
  if v_count <> 2 then
    raise exception 'Independent concurrent recovery cases did not both claim their own repair: %', v_count;
  end if;

  if exists (
    select 1
    from orchestration.recovery_actions a
    join orchestration.recovery_cases c on c.id = a.recovery_case_id
    where a.recovery_case_id in (
      '30000000-0000-4000-8000-000000000021',
      '30000000-0000-4000-8000-000000000031'
    )
      and a.project_id is distinct from c.project_id
  ) then
    raise exception 'Cross-project recovery action contamination detected.';
  end if;

  if not exists (
    select 1 from orchestration.recovery_actions
    where recovery_case_id = '30000000-0000-4000-8000-000000000021'
      and project_id = v_project_a
  ) or not exists (
    select 1 from orchestration.recovery_actions
    where recovery_case_id = '30000000-0000-4000-8000-000000000031'
      and project_id = v_project_b
  ) then
    raise exception 'Concurrent recovery project scope evidence is incomplete.';
  end if;
end
$do$;

select 'Execution recovery concurrency acceptance passed.' as result;

create table if not exists governance.recovery_policies (
  project_id uuid primary key references app.projects(id) on delete cascade,
  target_rpo_minutes integer not null default 60 check(target_rpo_minutes between 1 and 10080),
  target_rto_minutes integer not null default 240 check(target_rto_minutes between 1 and 10080),
  drill_frequency_days integer not null default 90 check(drill_frequency_days between 1 and 365),
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table governance.recovery_policies enable row level security;
drop policy if exists recovery_policies_read on governance.recovery_policies;
create policy recovery_policies_read on governance.recovery_policies for select to authenticated using(app_private.is_project_member(project_id));
grant select on governance.recovery_policies to authenticated;
grant all on governance.recovery_policies to service_role;

alter table governance.backup_restore_drills add column if not exists measured_rpo_minutes integer check(measured_rpo_minutes is null or measured_rpo_minutes>=0);
alter table governance.backup_restore_drills add column if not exists measured_rto_minutes integer check(measured_rto_minutes is null or measured_rto_minutes>=0);
alter table governance.backup_restore_drills add column if not exists policy_result text not null default 'NOT_EVALUATED';
alter table governance.backup_restore_drills drop constraint if exists backup_restore_drills_policy_result_check;
alter table governance.backup_restore_drills add constraint backup_restore_drills_policy_result_check check(policy_result in ('PASSED','FAILED','NOT_EVALUATED'));

create or replace function governance.evaluate_recovery_drill()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,governance
as $$
declare v_policy governance.recovery_policies%rowtype;
begin
  if new.project_id is null or new.status not in ('PASSED','FAILED') then
    new.policy_result:='NOT_EVALUATED';
    return new;
  end if;
  select * into v_policy from governance.recovery_policies where project_id=new.project_id and enabled=true;
  if not found or new.measured_rpo_minutes is null or new.measured_rto_minutes is null then
    new.policy_result:='NOT_EVALUATED';
    return new;
  end if;
  new.policy_result:=case
    when new.status='PASSED'
      and new.measured_rpo_minutes<=v_policy.target_rpo_minutes
      and new.measured_rto_minutes<=v_policy.target_rto_minutes then 'PASSED'
    else 'FAILED'
  end;
  return new;
end;
$$;
revoke execute on function governance.evaluate_recovery_drill() from public,anon,authenticated;
grant execute on function governance.evaluate_recovery_drill() to service_role;
drop trigger if exists evaluate_recovery_drill on governance.backup_restore_drills;
create trigger evaluate_recovery_drill before insert or update on governance.backup_restore_drills for each row execute function governance.evaluate_recovery_drill();

create or replace function governance.recovery_readiness(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,governance
as $$
declare v_policy governance.recovery_policies%rowtype; v_drill governance.backup_restore_drills%rowtype; v_due timestamptz;
begin
  select * into v_policy from governance.recovery_policies where project_id=p_project_id;
  if not found then return jsonb_build_object('status','NO_POLICY','project_id',p_project_id); end if;
  select * into v_drill from governance.backup_restore_drills
  where project_id=p_project_id and status in ('PASSED','FAILED')
  order by coalesce(completed_at,created_at) desc limit 1;
  v_due:=coalesce(v_drill.completed_at,v_drill.created_at,now()-make_interval(days=>v_policy.drill_frequency_days+1))+make_interval(days=>v_policy.drill_frequency_days);
  return jsonb_build_object(
    'status',case when not v_policy.enabled then 'DISABLED' when v_drill.id is null then 'DRILL_REQUIRED' when v_drill.policy_result<>'PASSED' then 'TARGETS_NOT_MET' when v_due<now() then 'DRILL_OVERDUE' else 'READY' end,
    'project_id',p_project_id,
    'policy',jsonb_build_object('target_rpo_minutes',v_policy.target_rpo_minutes,'target_rto_minutes',v_policy.target_rto_minutes,'drill_frequency_days',v_policy.drill_frequency_days,'enabled',v_policy.enabled),
    'latest_drill',case when v_drill.id is null then null else jsonb_build_object('id',v_drill.id,'drill_type',v_drill.drill_type,'status',v_drill.status,'policy_result',v_drill.policy_result,'measured_rpo_minutes',v_drill.measured_rpo_minutes,'measured_rto_minutes',v_drill.measured_rto_minutes,'completed_at',v_drill.completed_at) end,
    'next_drill_due_at',v_due
  );
end;
$$;
revoke execute on function governance.recovery_readiness(uuid) from public,anon,authenticated;
grant execute on function governance.recovery_readiness(uuid) to service_role;

insert into governance.recovery_policies(project_id)
select id from app.projects
on conflict(project_id) do nothing;

select pg_notify('pgrst','reload schema');

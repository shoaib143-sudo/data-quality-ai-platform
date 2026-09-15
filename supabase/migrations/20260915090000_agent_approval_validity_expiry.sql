begin;

alter table governance.project_agent_policy_context
  add column if not exists approval_validity_days integer not null default 7;

alter table governance.project_agent_policy_context
  drop constraint if exists project_agent_policy_context_approval_validity_days_check;

alter table governance.project_agent_policy_context
  add constraint project_agent_policy_context_approval_validity_days_check
  check (approval_validity_days > 0);

alter table governance.agent_approval_requests
  add column if not exists approval_expires_at timestamptz;

create or replace function governance.apply_agent_approval_expiry()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, governance
as $function$
declare
  v_validity_days integer := 7;
begin
  if new.status = 'READY_TO_EXECUTE'
     and new.approved_at is not null
     and (new.requires_business_approval or new.requires_governance_approval)
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.approved_at is distinct from new.approved_at
       or old.approval_expires_at is null
     ) then
    select p.approval_validity_days
      into v_validity_days
    from governance.project_agent_policy_context p
    where p.project_id = new.project_id;

    v_validity_days := coalesce(v_validity_days, 7);
    if v_validity_days <= 0 then
      raise exception 'Approval validity configuration is invalid';
    end if;

    new.approval_expires_at := new.approved_at + make_interval(days => v_validity_days);
  end if;

  return new;
end;
$function$;

revoke all on function governance.apply_agent_approval_expiry() from public, anon, authenticated;
grant execute on function governance.apply_agent_approval_expiry() to service_role;

drop trigger if exists trg_apply_agent_approval_expiry on governance.agent_approval_requests;
create trigger trg_apply_agent_approval_expiry
before insert or update of status, approved_at, approval_expires_at
on governance.agent_approval_requests
for each row execute function governance.apply_agent_approval_expiry();

update governance.agent_approval_requests r
set approval_expires_at = r.approved_at + make_interval(days => coalesce(p.approval_validity_days, 7))
from governance.project_agent_policy_context p
where p.project_id = r.project_id
  and r.status = 'READY_TO_EXECUTE'
  and r.approved_at is not null
  and (r.requires_business_approval or r.requires_governance_approval)
  and r.approval_expires_at is null;

update governance.agent_approval_requests r
set approval_expires_at = r.approved_at + interval '7 days'
where r.status = 'READY_TO_EXECUTE'
  and r.approved_at is not null
  and (r.requires_business_approval or r.requires_governance_approval)
  and r.approval_expires_at is null;

create index if not exists idx_agent_approval_requests_ready_expiry
  on governance.agent_approval_requests (approval_expires_at)
  where status = 'READY_TO_EXECUTE' and approval_expires_at is not null;

commit;

begin;

create or replace function governance.enforce_agent_approval_execution_validity()
returns trigger
language plpgsql
set search_path = pg_catalog, governance
as $function$
begin
  if tg_op = 'UPDATE'
     and (
       old.requires_business_approval is distinct from new.requires_business_approval
       or old.requires_governance_approval is distinct from new.requires_governance_approval
     ) then
    raise exception 'Approval requirement flags are immutable after request creation';
  end if;

  if new.status = 'READY_TO_EXECUTE'
     and (new.requires_business_approval or new.requires_governance_approval) then
    if new.approved_at is null then
      raise exception 'Human-approved execution request is missing final approval time';
    end if;
    if new.approval_expires_at is null then
      raise exception 'Human-approved execution request is missing approval expiry evidence';
    end if;
    if new.approval_expires_at <= statement_timestamp() then
      raise exception 'Human-approved execution request is already expired';
    end if;

    if tg_op = 'UPDATE'
       and old.status = 'READY_TO_EXECUTE'
       and (
         new.approved_at is distinct from old.approved_at
         or new.approval_expires_at is distinct from old.approval_expires_at
       ) then
      raise exception 'Approval validity evidence is immutable once execution is ready';
    end if;
  end if;

  if new.status = 'EXECUTED'
     and (tg_op = 'INSERT' or old.status is distinct from 'EXECUTED')
     and (
       new.requires_business_approval
       or new.requires_governance_approval
       or (
         tg_op = 'UPDATE'
         and (old.requires_business_approval or old.requires_governance_approval)
       )
     ) then
    if tg_op <> 'UPDATE' or old.status is distinct from 'READY_TO_EXECUTE' then
      raise exception 'Human-approved execution request must be READY_TO_EXECUTE before execution';
    end if;
    if old.approved_at is null or old.approval_expires_at is null then
      raise exception 'Human-approved execution request is missing approval validity evidence';
    end if;
    if new.approved_at is distinct from old.approved_at
       or new.approval_expires_at is distinct from old.approval_expires_at then
      raise exception 'Approval validity evidence cannot change during execution finalization';
    end if;
    if old.approval_expires_at <= statement_timestamp() then
      raise exception 'Human-approved execution request expired before execution';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function governance.enforce_agent_approval_execution_validity() from public, anon, authenticated;
grant execute on function governance.enforce_agent_approval_execution_validity() to service_role;

drop trigger if exists trg_enforce_agent_approval_execution_validity on governance.agent_approval_requests;
create trigger trg_enforce_agent_approval_execution_validity
before insert or update of status, approved_at, approval_expires_at, requires_business_approval, requires_governance_approval
on governance.agent_approval_requests
for each row execute function governance.enforce_agent_approval_execution_validity();

commit;

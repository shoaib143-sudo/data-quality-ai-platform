\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema governance;

create table governance.project_agent_policy_context (
  project_id uuid primary key
);

create table governance.agent_approval_requests (
  id uuid primary key,
  project_id uuid not null,
  status text not null default 'BUSINESS_PENDING',
  approved_at timestamptz,
  requires_business_approval boolean not null default false,
  requires_governance_approval boolean not null default false,
  updated_at timestamptz not null default now()
);

\i supabase/migrations/20260915090000_agent_approval_validity_expiry.sql
\i supabase/migrations/20260915103000_agent_approval_execution_expiry_guard.sql

insert into governance.project_agent_policy_context (project_id, approval_validity_days)
values ('11111111-1111-1111-1111-111111111111', 7);

insert into governance.agent_approval_requests (
  id, project_id, status, requires_business_approval
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'BUSINESS_PENDING',
  true
);

update governance.agent_approval_requests
set status = 'READY_TO_EXECUTE', approved_at = statement_timestamp()
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $test$
declare
  v_row governance.agent_approval_requests%rowtype;
begin
  select * into v_row
  from governance.agent_approval_requests
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  if v_row.approval_expires_at is null then
    raise exception 'expected server-derived approval expiry';
  end if;
  if v_row.approval_expires_at <> v_row.approved_at + interval '7 days' then
    raise exception 'expected seven-day approval validity';
  end if;
end;
$test$;

update governance.agent_approval_requests
set status = 'EXECUTED'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $test$
begin
  if not exists (
    select 1 from governance.agent_approval_requests
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and status = 'EXECUTED'
  ) then
    raise exception 'valid human approval should execute';
  end if;
end;
$test$;

do $test$
begin
  begin
    insert into governance.agent_approval_requests (
      id, project_id, status, requires_business_approval
    ) values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '11111111-1111-1111-1111-111111111111',
      'READY_TO_EXECUTE',
      true
    );
    raise exception 'expected READY_TO_EXECUTE without approval evidence to fail';
  exception
    when others then
      if sqlerrm = 'expected READY_TO_EXECUTE without approval evidence to fail' then raise; end if;
      if position('missing final approval time' in sqlerrm) = 0 then raise; end if;
  end;
end;
$test$;

alter table governance.agent_approval_requests disable trigger trg_enforce_agent_approval_execution_validity;
insert into governance.agent_approval_requests (
  id, project_id, status, approved_at, requires_business_approval
) values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '11111111-1111-1111-1111-111111111111',
  'READY_TO_EXECUTE',
  statement_timestamp() - interval '8 days',
  true
);
alter table governance.agent_approval_requests enable trigger trg_enforce_agent_approval_execution_validity;

do $test$
begin
  begin
    update governance.agent_approval_requests
    set status = 'EXECUTED'
    where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    raise exception 'expected expired human approval execution to fail';
  exception
    when others then
      if sqlerrm = 'expected expired human approval execution to fail' then raise; end if;
      if position('expired before execution' in sqlerrm) = 0 then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    insert into governance.agent_approval_requests (
      id, project_id, status, requires_business_approval
    ) values (
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      '11111111-1111-1111-1111-111111111111',
      'BUSINESS_PENDING',
      true
    );
    update governance.agent_approval_requests
    set status = 'EXECUTED'
    where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    raise exception 'expected direct pending-to-executed transition to fail';
  exception
    when others then
      if sqlerrm = 'expected direct pending-to-executed transition to fail' then raise; end if;
      if position('must be READY_TO_EXECUTE' in sqlerrm) = 0 then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    insert into governance.agent_approval_requests (
      id, project_id, status, approved_at, approval_expires_at, requires_business_approval
    ) values (
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '11111111-1111-1111-1111-111111111111',
      'EXECUTED',
      statement_timestamp(),
      statement_timestamp() + interval '7 days',
      true
    );
    raise exception 'expected insert-as-executed human approval to fail';
  exception
    when others then
      if sqlerrm = 'expected insert-as-executed human approval to fail' then raise; end if;
      if position('must be READY_TO_EXECUTE' in sqlerrm) = 0 then raise; end if;
  end;
end;
$test$;

insert into governance.agent_approval_requests (
  id, project_id, status, requires_business_approval
) values (
  '12121212-1212-1212-1212-121212121212',
  '11111111-1111-1111-1111-111111111111',
  'BUSINESS_PENDING',
  true
);
update governance.agent_approval_requests
set status = 'READY_TO_EXECUTE', approved_at = statement_timestamp()
where id = '12121212-1212-1212-1212-121212121212';

do $test$
begin
  begin
    update governance.agent_approval_requests
    set requires_business_approval = false
    where id = '12121212-1212-1212-1212-121212121212';
    raise exception 'expected approval requirement downgrade to fail';
  exception
    when others then
      if sqlerrm = 'expected approval requirement downgrade to fail' then raise; end if;
      if position('flags are immutable' in sqlerrm) = 0 then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    update governance.agent_approval_requests
    set approval_expires_at = approval_expires_at + interval '30 days'
    where id = '12121212-1212-1212-1212-121212121212';
    raise exception 'expected approval expiry extension to fail';
  exception
    when others then
      if sqlerrm = 'expected approval expiry extension to fail' then raise; end if;
      if position('validity evidence is immutable' in sqlerrm) = 0 then raise; end if;
  end;
end;
$test$;

insert into governance.agent_approval_requests (
  id, project_id, status, requires_business_approval, requires_governance_approval
) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '11111111-1111-1111-1111-111111111111',
  'READY_TO_EXECUTE',
  false,
  false
);

update governance.agent_approval_requests
set status = 'EXECUTED'
where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

select 'Agent approval validity dynamic and negative tests passed.' as result;

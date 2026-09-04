-- Governed lineage change execution handoff
-- Persists the authorization boundary without performing production mutation.

create table if not exists governance.lineage_change_execution_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  analysis_id uuid not null references governance.lineage_impact_analyses(id) on delete cascade,
  workflow_instance_id uuid references governance.workflow_instances(id) on delete set null,
  authorization_id uuid not null unique,
  requested_by uuid references auth.users(id) on delete set null,
  execution_target text not null,
  execution_reference text,
  idempotency_key text not null unique,
  status text not null default 'AUTHORIZED' check (status in ('AUTHORIZED','CLAIMED','EXECUTING','SUCCEEDED','FAILED','CANCELLED')),
  authorization_context jsonb not null default '{}'::jsonb,
  executor_id text,
  claimed_at timestamptz,
  completed_at timestamptz,
  execution_result jsonb not null default '{}'::jsonb,
  authorized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(execution_target)) > 0),
  check (length(trim(idempotency_key)) > 0)
);

create index if not exists lineage_change_execution_requests_project_idx
  on governance.lineage_change_execution_requests(project_id,created_at desc);
create index if not exists lineage_change_execution_requests_analysis_idx
  on governance.lineage_change_execution_requests(analysis_id,created_at desc);
create index if not exists lineage_change_execution_requests_workflow_idx
  on governance.lineage_change_execution_requests(workflow_instance_id)
  where workflow_instance_id is not null;
create index if not exists lineage_change_execution_requests_status_idx
  on governance.lineage_change_execution_requests(project_id,status,authorized_at asc);
create index if not exists lineage_change_execution_requests_requested_by_idx
  on governance.lineage_change_execution_requests(requested_by)
  where requested_by is not null;

alter table governance.lineage_change_execution_requests enable row level security;

drop policy if exists lineage_change_execution_requests_read on governance.lineage_change_execution_requests;
create policy lineage_change_execution_requests_read on governance.lineage_change_execution_requests
for select to authenticated using (app_private.is_project_member(project_id));

revoke insert,update,delete on governance.lineage_change_execution_requests from authenticated;
grant select on governance.lineage_change_execution_requests to authenticated;
grant all on governance.lineage_change_execution_requests to service_role;

drop trigger if exists trg_audit_lineage_change_execution_requests on governance.lineage_change_execution_requests;
create trigger trg_audit_lineage_change_execution_requests
  after insert or update or delete on governance.lineage_change_execution_requests
  for each row execute function governance.audit_project_table_change();

select pg_notify('pgrst','reload schema');

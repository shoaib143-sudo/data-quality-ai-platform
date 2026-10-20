begin;

alter table governance.platform_execution_evidence
  add column if not exists deployment_id text;

update governance.platform_execution_evidence
set deployment_id = plan_id
where deployment_id is null;

alter table governance.platform_execution_evidence
  alter column deployment_id set not null;

create index if not exists platform_execution_evidence_deployment_idx
  on governance.platform_execution_evidence(project_id, deployment_id, recorded_at asc);

comment on column governance.platform_execution_evidence.deployment_id is
  'Aggregate provider-neutral deployment identifier returned to API and MCP callers; plan_id remains the provider-target plan identifier.';

commit;

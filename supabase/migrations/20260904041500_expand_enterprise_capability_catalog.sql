update governance.access_roles set capabilities=array[
  'catalog.read','glossary.read','lineage.read','profiling.read','quality.read','observability.read','audit.read','report.export'
] where role_key='READ_ONLY';

update governance.access_roles set capabilities=array[
  'catalog.read','catalog.update','glossary.read','glossary.manage','lineage.read','profiling.read','profiling.execute',
  'quality.read','quality.execute','observability.read','issues.manage','classification.review','certification.request',
  'certification.review','stewardship.manage','discovery.execute','report.export','audit.read'
] where role_key='DATA_STEWARD';

update governance.access_roles set capabilities=array[
  'catalog.read','catalog.update','glossary.read','lineage.read','profiling.read','profiling.execute','quality.read',
  'quality.manage','quality.execute','quality.exception.approve','observability.read','observability.manage','issues.manage',
  'classification.review','policy.approve','certification.request','certification.review','contract.manage','contract.approve',
  'stewardship.manage','source.manage','schedule.manage','notification.manage','workflow.manage','discovery.execute',
  'capacity.manage','retention.manage','report.export','audit.read'
] where role_key='DATA_OWNER';

update governance.access_roles set capabilities=array[
  'catalog.read','profiling.read','profiling.execute','quality.read','quality.manage','quality.execute',
  'quality.exception.approve','observability.read','issues.manage','schedule.manage','report.export'
] where role_key='QUALITY_MANAGER';

update governance.access_roles set capabilities=array[
  'catalog.read','glossary.read','lineage.read','profiling.read','quality.read','observability.read',
  'classification.review','policy.approve','certification.review','contract.approve','workflow.manage','report.export','audit.read'
] where role_key='POLICY_APPROVER';

create or replace function governance.has_project_capability(p_project_id uuid,p_user_id uuid,p_capability text)
returns boolean language sql stable security definer
set search_path=pg_catalog,governance,app
as $$
  select
    exists(
      select 1 from app.projects p join app.organization_members om on om.organization_id=p.organization_id
      where p.id=p_project_id and om.user_id=p_user_id and om.role in ('OWNER','ADMIN')
    )
    or exists(
      select 1 from governance.project_role_bindings b join governance.access_roles r on r.role_key=b.role_key
      where b.project_id=p_project_id and b.user_id=p_user_id and b.active=true
        and (b.expires_at is null or b.expires_at>now()) and p_capability=any(r.capabilities)
    )
    or (
      p_capability=any(array['catalog.read','glossary.read','lineage.read','profiling.read','quality.read','observability.read','audit.read','report.export'])
      and exists(
        select 1 from app.projects p join app.organization_members om on om.organization_id=p.organization_id
        where p.id=p_project_id and om.user_id=p_user_id
      )
    );
$$;
revoke execute on function governance.has_project_capability(uuid,uuid,text) from public,anon;
grant execute on function governance.has_project_capability(uuid,uuid,text) to authenticated,service_role;

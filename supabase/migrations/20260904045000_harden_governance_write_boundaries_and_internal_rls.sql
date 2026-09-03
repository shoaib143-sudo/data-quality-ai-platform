revoke execute on function governance.has_project_capability(uuid,uuid,text) from authenticated;
grant execute on function governance.has_project_capability(uuid,uuid,text) to service_role;

revoke insert,update,delete on governance.project_role_bindings from authenticated;
drop policy if exists project_role_bindings_access on governance.project_role_bindings;
drop policy if exists project_role_bindings_read on governance.project_role_bindings;
create policy project_role_bindings_read on governance.project_role_bindings
for select to authenticated using(app_private.is_project_member(project_id));

revoke insert,update,delete on governance.data_contracts from authenticated;
drop policy if exists data_contracts_access on governance.data_contracts;
drop policy if exists data_contracts_read on governance.data_contracts;
create policy data_contracts_read on governance.data_contracts
for select to authenticated using(app_private.is_project_member(project_id));

revoke insert,update,delete on governance.workflow_definitions from authenticated;
revoke insert,update,delete on governance.workflow_instances from authenticated;
drop policy if exists workflow_definitions_access on governance.workflow_definitions;
drop policy if exists workflow_instances_access on governance.workflow_instances;
drop policy if exists workflow_definitions_read on governance.workflow_definitions;
drop policy if exists workflow_instances_read on governance.workflow_instances;
create policy workflow_definitions_read on governance.workflow_definitions
for select to authenticated using(app_private.is_project_member(project_id));
create policy workflow_instances_read on governance.workflow_instances
for select to authenticated using(app_private.is_project_member(project_id));

revoke insert,update,delete on orchestration.capacity_policies from authenticated;
revoke insert,update,delete on profiling.sampling_policies from authenticated;
revoke insert,update,delete on governance.backup_restore_drills from authenticated;
drop policy if exists capacity_policies_access on orchestration.capacity_policies;
drop policy if exists sampling_policies_access on profiling.sampling_policies;
drop policy if exists backup_restore_drills_access on governance.backup_restore_drills;
drop policy if exists capacity_policies_read on orchestration.capacity_policies;
drop policy if exists sampling_policies_read on profiling.sampling_policies;
drop policy if exists backup_restore_drills_read on governance.backup_restore_drills;
create policy capacity_policies_read on orchestration.capacity_policies
for select to authenticated using(app_private.is_project_member(project_id));
create policy sampling_policies_read on profiling.sampling_policies
for select to authenticated using(app_private.is_project_member(project_id));
create policy backup_restore_drills_read on governance.backup_restore_drills
for select to authenticated using(project_id is null or app_private.is_project_member(project_id));

revoke insert,update,delete on governance.retention_policies from authenticated;
drop policy if exists retention_policies_project_access on governance.retention_policies;
drop policy if exists retention_policies_read on governance.retention_policies;
create policy retention_policies_read on governance.retention_policies
for select to authenticated using(app_private.is_project_member(project_id));

drop policy if exists dataset_execution_registry_read on profiling.dataset_execution_registry;
create policy dataset_execution_registry_read on profiling.dataset_execution_registry
for select to authenticated using(
  exists(
    select 1 from catalog.dataset_versions dv
    join catalog.datasets d on d.id=dv.dataset_id
    where dv.id=dataset_execution_registry.dataset_version_id
      and app_private.is_project_member(d.project_id)
  )
);

drop policy if exists dataset_row_access_registry_read on profiling.dataset_row_access_registry;
create policy dataset_row_access_registry_read on profiling.dataset_row_access_registry
for select to authenticated using(
  exists(
    select 1 from catalog.dataset_versions dv
    join catalog.datasets d on d.id=dv.dataset_id
    where dv.id=dataset_row_access_registry.dataset_version_id
      and app_private.is_project_member(d.project_id)
  )
);

drop policy if exists metric_repair_audit_read on profiling.metric_repair_audit;
create policy metric_repair_audit_read on profiling.metric_repair_audit
for select to authenticated using(
  exists(
    select 1 from profiling.profile_runs pr
    join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
    join catalog.datasets d on d.id=dv.dataset_id
    where pr.id=metric_repair_audit.profile_run_id
      and app_private.is_project_member(d.project_id)
  )
);

grant select on profiling.dataset_execution_registry,profiling.dataset_row_access_registry,profiling.metric_repair_audit to authenticated;

select pg_notify('pgrst','reload schema');

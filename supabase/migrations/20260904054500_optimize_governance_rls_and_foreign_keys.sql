drop policy if exists audit_select on governance.audit_events;
drop policy if exists lineage_select on governance.lineage_edges;
drop policy if exists quality_rule_definitions_select on profiling.quality_rule_definitions;

create index if not exists lineage_assets_dataset_idx on governance.lineage_assets(dataset_id) where dataset_id is not null;
create index if not exists lineage_assets_integration_idx on governance.lineage_assets(integration_id) where integration_id is not null;
create index if not exists lineage_ingestion_events_integration_idx on governance.lineage_ingestion_events(integration_id) where integration_id is not null;
create index if not exists lineage_integrations_created_by_idx on governance.lineage_integrations(created_by) where created_by is not null;
create index if not exists scim_directories_created_by_idx on governance.scim_directories(created_by) where created_by is not null;
create index if not exists sso_domains_created_by_idx on governance.sso_domains(created_by) where created_by is not null;
create index if not exists sso_domains_organization_idx on governance.sso_domains(organization_id);
create index if not exists workflow_definitions_created_by_idx on governance.workflow_definitions(created_by) where created_by is not null;

select pg_notify('pgrst','reload schema');

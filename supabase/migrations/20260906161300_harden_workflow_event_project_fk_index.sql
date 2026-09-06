create index if not exists workflow_instance_events_project_fk_idx
  on governance.workflow_instance_events (project_id);

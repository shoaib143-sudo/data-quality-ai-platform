-- Remove temporary duplicate project environment column.
-- governance.project_agent_policy_context is the canonical Agent Policy v2 source of truth.

drop index if exists app.idx_projects_environment_class;
alter table app.projects drop column if exists environment_class;

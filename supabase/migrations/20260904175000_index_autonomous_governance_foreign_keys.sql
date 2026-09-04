-- Cover foreign keys used by autonomous Data Quality and Observability operations.

create index if not exists dq_investigations_dataset_version_idx
  on governance.data_quality_investigations(dataset_version_id);
create index if not exists dq_investigations_profile_run_idx
  on governance.data_quality_investigations(profile_run_id);

create index if not exists dq_learning_verification_run_idx
  on governance.data_quality_recommendation_learning(verification_agent_run_id);
create index if not exists dq_learning_remediation_outcome_idx
  on governance.data_quality_recommendation_learning(remediation_outcome_id);
create index if not exists dq_learning_created_by_idx
  on governance.data_quality_recommendation_learning(created_by);
create index if not exists dq_learning_source_run_idx
  on governance.data_quality_recommendation_learning(source_agent_run_id);

create index if not exists dq_remediation_verification_profile_agent_idx
  on governance.data_quality_remediation_outcomes(verification_profiling_agent_run_id);
create index if not exists dq_remediation_created_by_idx
  on governance.data_quality_remediation_outcomes(created_by);
create index if not exists dq_remediation_investigation_idx
  on governance.data_quality_remediation_outcomes(investigation_id);

create index if not exists observability_incident_impacts_project_idx
  on governance.observability_incident_impacts(project_id);
create index if not exists observability_incidents_dataset_idx
  on governance.observability_incidents(dataset_id);
create index if not exists observability_incidents_workflow_idx
  on governance.observability_incidents(workflow_instance_id);

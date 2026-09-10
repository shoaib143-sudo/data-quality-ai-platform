-- Production hardening: add covering indexes for every currently unindexed FK
-- reported across DataNexus-owned application schemas. These are non-unique and
-- do not change referential or authorization semantics.

create index if not exists idx_fk_asset_promotion_dataset on catalog.asset_promotion_requests(dataset_id);
create index if not exists idx_fk_asset_promotion_decided_by on catalog.asset_promotion_requests(decided_by);
create index if not exists idx_fk_asset_promotion_discovered on catalog.asset_promotion_requests(discovered_asset_id);
create index if not exists idx_fk_asset_promotion_requested_by on catalog.asset_promotion_requests(requested_by);
create index if not exists idx_fk_asset_trust_revision on catalog.asset_trust_assessments(catalog_revision_id);
create index if not exists idx_fk_asset_trust_project on catalog.asset_trust_assessments(project_id);
create index if not exists idx_fk_field_change_event on catalog.catalog_field_change_events(change_event_id);
create index if not exists idx_fk_field_change_project on catalog.catalog_field_change_events(project_id);
create index if not exists idx_fk_field_change_scope on catalog.catalog_field_change_events(scope_id);
create index if not exists idx_fk_field_change_source on catalog.catalog_field_change_events(source_id);

create index if not exists idx_fk_ai_exec_actor on governance.ai_execution_control_events(actor_user_id);
create index if not exists idx_fk_ai_suggestion_reviewer on governance.ai_governance_suggestion_decisions(reviewer_user_id);
create index if not exists idx_fk_ai_pricing_created_by on governance.ai_model_pricing_versions(created_by);
create index if not exists idx_fk_ai_pricing_reviewed_by on governance.ai_model_pricing_versions(reviewed_by);
create index if not exists idx_fk_ai_budget_reviewer on governance.ai_resource_budget_policy_versions(reviewer_user_id);
create index if not exists idx_fk_ai_retrieval_reviewer on governance.ai_retrieval_evaluation_case_versions(reviewer_user_id);
create index if not exists idx_fk_ai_assessment_system on governance.ai_system_assessments(ai_system_id);
create index if not exists idx_fk_ai_assessment_assessor on governance.ai_system_assessments(assessor_user_id);
create index if not exists idx_fk_ai_assessment_project on governance.ai_system_assessments(project_id);
create index if not exists idx_fk_ai_assessment_agent_run on governance.ai_system_assessments(source_agent_run_id);
create index if not exists idx_fk_ai_decision_system on governance.ai_system_decisions(ai_system_id);
create index if not exists idx_fk_ai_decision_project on governance.ai_system_decisions(project_id);
create index if not exists idx_fk_ai_decision_reviewer on governance.ai_system_decisions(reviewer_user_id);
create index if not exists idx_fk_audit_snapshot_chain_tip on governance.audit_report_snapshots(chain_tip_event_id);
create index if not exists idx_fk_control_eval_control on governance.control_evaluations(control_id);
create index if not exists idx_fk_control_eval_scope on governance.control_evaluations(scope_binding_id);
create index if not exists idx_fk_control_evidence_control on governance.control_evidence(control_id);
create index if not exists idx_fk_control_evidence_scope on governance.control_evidence(scope_binding_id);
create index if not exists idx_fk_control_waiver_event on governance.control_waiver_events(waiver_id);
create index if not exists idx_fk_control_waiver_control on governance.control_waivers(control_id);
create index if not exists idx_fk_control_waiver_scope on governance.control_waivers(scope_binding_id);
create index if not exists idx_fk_gov_finding_control on governance.governance_findings(control_id);
create index if not exists idx_fk_gov_finding_evaluation on governance.governance_findings(evaluation_id);
create index if not exists idx_fk_landing_setting_updated_by on governance.landing_page_settings(updated_by);
create index if not exists idx_fk_lineage_asset_revision on governance.lineage_assets(catalog_revision_id);
create index if not exists idx_fk_lineage_enrichment_revision on governance.lineage_enrichment_runs(catalog_revision_id);
create index if not exists idx_fk_lineage_enrichment_discovery on governance.lineage_enrichment_runs(discovery_run_id);
create index if not exists idx_fk_lineage_ingestion_revision on governance.lineage_ingestion_events(catalog_revision_id);
create index if not exists idx_fk_lineage_ingestion_discovery on governance.lineage_ingestion_events(discovery_run_id);
create index if not exists idx_fk_org_ui_updated_by on governance.organization_ui_preferences(updated_by);
create index if not exists idx_fk_remediation_event_project on governance.remediation_outcome_events(project_id);

create index if not exists idx_fk_job_dependency_child on orchestration.job_dependencies(project_id, job_id);

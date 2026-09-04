create index if not exists agent_learning_cases_agent_definition_fk_idx on agent.agent_learning_cases(agent_definition_id);
create index if not exists agent_learning_cases_source_agent_run_fk_idx on agent.agent_learning_cases(source_agent_run_id);
create index if not exists agent_memories_agent_definition_fk_idx on agent.agent_memories(agent_definition_id);
create index if not exists agent_memories_source_agent_run_fk_idx on agent.agent_memories(source_agent_run_id);

create index if not exists autonomy_actions_approval_workflow_fk_idx on governance.autonomy_actions(approval_workflow_instance_id);
create index if not exists autonomy_actions_policy_fk_idx on governance.autonomy_actions(policy_id);
create index if not exists autonomy_actions_requested_by_fk_idx on governance.autonomy_actions(requested_by);
create index if not exists autonomy_actions_source_agent_run_fk_idx on governance.autonomy_actions(source_agent_run_id);

create index if not exists cde_mappings_cde_fk_idx on governance.cde_mappings(cde_id);
create index if not exists cde_mappings_dataset_fk_idx on governance.cde_mappings(dataset_id);
create index if not exists critical_data_elements_classification_label_fk_idx on governance.critical_data_elements(classification_label_id);
create index if not exists dataset_business_context_links_business_asset_fk_idx on governance.dataset_business_context_links(business_context_asset_id);
create index if not exists dataset_business_context_links_dataset_fk_idx on governance.dataset_business_context_links(dataset_id);
create index if not exists dataset_certifications_dataset_fk_idx on governance.dataset_certifications(dataset_id);
create index if not exists governance_risk_predictions_source_profile_run_fk_idx on governance.governance_risk_predictions(source_profile_run_id);
create index if not exists knowledge_requirements_document_fk_idx on governance.knowledge_requirements(document_id);
create index if not exists lineage_edges_project_transformation_fk_idx on governance.lineage_edges(project_id,transformation_id);
create index if not exists regulatory_applicability_regulation_document_fk_idx on governance.regulatory_applicability(regulation_document_id);
create index if not exists remediation_knowledge_dataset_fk_idx on governance.remediation_knowledge(dataset_id);
create index if not exists remediation_knowledge_issue_fk_idx on governance.remediation_knowledge(issue_id);

import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing agent specialization artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}

function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing agent specialization contract: ${pattern}`)
  }
}

requireText('lib/agents/governance-specialist-agent.ts', [
  'stewardship_and_governance_completeness',
  'cross_domain_governance_risk',
  'architecture_lineage_contract_and_change_risk',
  'root_cause_hypothesis_and_prior_case_reuse',
  'executive_governance_health_and_priority',
  'operational_support_and_governance_diagnostics',
  'search_governance_knowledge_lexical',
  'traverse_knowledge_graph',
  'quality_rule_runs',
  'profile_comparisons',
  'profile_anomalies',
  'dataset_certifications',
  'remediation_knowledge',
  'regulatory_applicability',
  "from('lineage_assets')",
  "from('lineage_transformations')",
  "from('lineage_column_mappings')",
  "not('transformation_id', 'is', null)",
  'lineageTransformations: ctx.lineageTransformations.slice(0, 50)',
  'lineageColumnMappings: ctx.lineageColumnMappings.slice(0, 100)',
  'lineageTransformationEdges: ctx.lineageTransformationEdges.slice(0, 50)',
  'field-level lineage mapping(s) are available as governed technical evidence',
  'field-level mapping(s)',
  'bounded root-cause tracing',
  'field_lineage_mapping_count',
  'reasoningContract',
  'confidence',
  'evidence_count',
  'evidence_sources',
  "approval_status: 'NOT_APPLICABLE_READ_ONLY'",
  'GOVERNANCE_SPECIALIST_AGENT_COMPLETED',
])

requireText('app/api/agents/governance/run/route.ts', [
  'executeGovernanceSpecialistAgent',
  "authorizeProject(user.id, projectId, 'agent.execute')",
  'persistGovernedAgentMemoryAndEvaluation',
])

requireText('app/api/agents/governance/handoff/route.ts', [
  'executeGovernanceSpecialistAgent',
  'GOVERNED_AGENT_HANDOFF_COMPLETED',
  'specialist: true',
])

requireText('lib/agents/governance-job-worker.ts', [
  'executeGovernanceSpecialistAgent',
  'loadReusableSucceededRun',
  'attachAgentRunToJob',
  'persistInvestigatorRiskAssessment',
  'enrichGovernedAgentWithMemory',
  'persistGovernedAgentMemoryAndEvaluation',
  'markDurableJobSucceeded',
  'markDurableJobFailed',
  "agentKey === 'investigator_agent'",
])

requireText('lib/orchestration/queue.ts', [
  "'GOVERNANCE_AGENT'",
])

requireText('app/api/jobs/worker/route.ts', [
  'processGovernanceAgentJobs',
  "job.job_type === 'GOVERNANCE_AGENT'",
  'governanceAgentResults',
])

requireText('supabase/migrations/20260904235120_governance_agent_durable_job_type.sql', [
  'job_queue_job_type_check',
  "'GOVERNANCE_AGENT'::text",
])

requireText('app/api/agents/run/route.ts', [
  "const PRODUCTION_AGENT_KEY = 'profiling_agent'",
  "const PRODUCTION_AGENT_VERSION = '2.0'",
  'validateDataSourceForProfiling',
  "jobType: 'PROFILING'",
])

requireText('lib/agents/run-profiling-job.ts', [
  'executePreparedProfilingJob',
  "requiredTools = ['profile_dataset', 'execute_metrics', 'investigate_profile']",
  'executeProfilingExecutor',
  'validateProfilingRun',
  'syncProfileClassifications',
])

requireText('lib/data-quality/automation.ts', [
  'syncSuggestedQualityRules',
  'executeQualityAutomation',
])

requireText('lib/data-quality/autonomous-operations.ts', [
  'investigateDataQualityRun',
])

console.log('Governed agent specialization contracts verified.')

import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(path, 'utf8')
}

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`AI governance due diligence contract missing: ${label}`)
}

const worker = read('lib/agents/governance-job-worker.ts')
const semanticJobs = read('lib/governance/semantic-jobs.ts')
const fieldLineage = read('supabase/migrations/20260905000510_synthetic_field_lineage_integration_suite.sql')
const contractRename = read('supabase/migrations/20260905000949_rename_contract_specific_evaluator.sql')
const metricEngine = read('lib/profiling/metric-engine.ts')

requireText(worker, 'sourceAgentRunId', 'durable governance handoff source provenance')
requireText(worker, 'parent_run_id', 'durable handoff parent run linkage')
requireText(worker, "message_type: 'GOVERNED_HANDOFF'", 'durable handoff message persistence')
requireText(worker, "eventType: 'GOVERNED_AGENT_HANDOFF_COMPLETED'", 'durable handoff governance audit')
requireText(worker, 'await persistRunOutput(result.runId, output)', 'memory-enriched specialist output persistence')
requireText(worker, 'persistGovernedAgentMemoryAndEvaluation', 'durable handoff memory and evaluation persistence')
requireText(worker, 'persistInvestigatorRiskAssessment', 'durable investigator risk persistence')

requireText(fieldLineage, 'run_synthetic_field_lineage_integration_suite', 'self-cleaning field-lineage integration suite')
requireText(fieldLineage, "'column_mappings_complete'", 'field-lineage mapping assertion')
requireText(fieldLineage, 'search_field_lineage_anchors', 'field-level lineage search assertion')
requireText(fieldLineage, "'self_cleaning',true", 'field-lineage cleanup evidence')
requireText(fieldLineage, 'delete from app.organizations', 'field-lineage synthetic cleanup')

requireText(contractRename, 'evaluate_data_contract_for_contract', 'unambiguous contract-specific evaluator name')
requireText(contractRename, 'governance.evaluate_data_contract_for_contract(v_contract_id,p_profile_run_id)', 'automatic contract evaluation delegation')
requireText(contractRename, "'DATA_CONTRACT_FAILED'", 'contract failure certification invalidation')
requireText(contractRename, "category,severity,title,description,fingerprint,evidence,status", 'contract failure observability alert')

requireText(metricEngine, 'completenessMissingRate', 'blank-aware profiling completeness')
requireText(metricEngine, 'whitespace_only_count', 'blank/whitespace profiling evidence')
requireText(metricEngine, 'result.completeness_rate', 'global score uses blank-aware completeness')

requireText(semanticJobs, 'GOVERNANCE_EMBEDDING_URL', 'explicit semantic embedding configuration boundary')
requireText(semanticJobs, 'configured: false, queued: 0, projects: 0, skipped: true', 'visible semantic scheduling skip state')

console.log('AI governance due diligence source contracts verified.')

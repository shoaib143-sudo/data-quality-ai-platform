import fs from 'node:fs'

const contract = fs.readFileSync('lib/ai/evaluation-dataset.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-evaluation-dataset.ts', 'utf8')
const retrievalContract = fs.readFileSync('lib/ai/retrieval-evaluation-dataset.ts', 'utf8')
const retrievalAdapter = fs.readFileSync('lib/ai/governance-retrieval-evaluation-dataset.ts', 'utf8')
const retrievalMigration = fs.readFileSync('supabase/migrations/20260909010519_adr006_governed_retrieval_relevance_labels.sql', 'utf8')

const checks = [
  [contract.includes("datasetKind: 'verified_production_cases'"), 'dataset identifies verified production cases'],
  [contract.includes("sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING'"), 'dataset admits the canonical DQ learning source kind'],
  [contract.includes("decision_status !== 'VERIFIED'"), 'case decision must be verified'],
  [contract.includes("outcome_status !== 'VERIFIED'"), 'case outcome must be verified'],
  [contract.includes("learning.status !== 'VERIFIED'"), 'recommendation learning must be verified'],
  [contract.includes('learning.effective !== true'), 'recommendation learning must be effective'],
  [contract.includes("learning.outcome.status !== 'VERIFIED'"), 'remediation outcome must be verified'],
  [contract.includes('allChecksPassed(learning.outcome.checks)'), 'all deterministic verification checks must pass'],
  [contract.includes('hasSyntheticBootstrap'), 'synthetic bootstrap evidence is detected'],
  [contract.includes("key.toLowerCase() === 'synthetic_bootstrap'"), 'synthetic bootstrap flag is explicitly rejected'],
  [!contract.includes('recommendation: learningCase.recommendation'), 'AI recommendation prose is not projected as expected-answer truth'],
  [adapter.includes(".schema('agent')") && adapter.includes(".from('agent_learning_cases')"), 'adapter reads canonical agent learning cases'],
  [adapter.includes(".from('data_quality_recommendation_learning')"), 'adapter reads canonical DQ recommendation learning'],
  [adapter.includes(".from('data_quality_remediation_outcomes')"), 'adapter reads canonical remediation outcomes'],
  [adapter.includes(".eq('status', 'VERIFIED')"), 'adapter prefilters verified canonical evidence'],
  [retrievalContract.includes("'HUMAN_REVIEWED' | 'GOVERNED_IMPORT'"), 'retrieval labels require explicit governed authority class'],
  [retrievalContract.includes('requires at least one positive relevance judgment'), 'retrieval labels fail closed without a positive judgment'],
  [retrievalAdapter.includes(".from('ai_retrieval_evaluation_case_effective')"), 'retrieval adapter reads canonical effective case versions'],
  [retrievalAdapter.includes(".from('ai_retrieval_relevance_judgments')"), 'retrieval adapter reads canonical relevance judgments'],
  [retrievalAdapter.includes(".eq('project_id', normalizedProjectId)"), 'retrieval adapter scopes canonical reads to the requested project'],
  [retrievalAdapter.includes('governance.ai_retrieval_evaluation_case_versions:'), 'retrieval dataset preserves case-version provenance'],
  [retrievalAdapter.includes('governance.ai_retrieval_relevance_judgments:'), 'retrieval dataset preserves judgment provenance'],
  [!retrievalAdapter.includes('.insert(') && !retrievalAdapter.includes('.update(') && !retrievalAdapter.includes('.delete(') && !retrievalAdapter.includes('.upsert('), 'retrieval adapter remains read-only'],
  [retrievalMigration.includes("authority in ('HUMAN_REVIEWED','GOVERNED_IMPORT')"), 'database constrains retrieval label authority'],
  [retrievalMigration.includes('cardinality(evidence_refs) > 0'), 'database requires evidence references'],
  [retrievalMigration.includes('RETRIEVAL_JUDGMENT_PROJECT_MISMATCH'), 'database rejects cross-project judgment attachment'],
  [retrievalMigration.includes('with (security_invoker = true)'), 'effective retrieval case view preserves caller security'],
  [retrievalMigration.includes('enable row level security'), 'retrieval label tables enforce RLS'],
  [!retrievalMigration.match(/insert\s+into\s+governance\.ai_retrieval/i), 'migration does not seed or fabricate retrieval labels'],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`)
  process.exit(1)
}

console.log('ADR-006 verified evaluation and governed retrieval dataset authority boundaries verified.')

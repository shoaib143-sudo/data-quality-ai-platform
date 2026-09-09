import fs from 'node:fs'

const engine = fs.readFileSync('lib/ai/evaluation-engine.ts', 'utf8')
const retrievalEvaluation = fs.readFileSync('lib/ai/retrieval-evaluation.ts', 'utf8')
const benchmarkRunner = fs.readFileSync('lib/ai/retrieval-benchmark-runner.ts', 'utf8')
const governedBenchmark = fs.readFileSync('lib/ai/governance-retrieval-benchmark.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-evaluation-engine.ts', 'utf8')
const route = fs.readFileSync('app/api/governance/evaluations/route.ts', 'utf8')
const ledger = fs.readFileSync('supabase/migrations/20260908150019_add_ai_evaluation_results_ledger.sql', 'utf8')
const scorecard = fs.readFileSync('supabase/migrations/20260908150134_add_ai_evaluation_scorecard_projection.sql', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`EvaluationEngine contract missing: ${label}`)
}

requireText(engine, 'export interface EvaluationEngine', 'stable evaluation engine interface')
requireText(engine, 'record(result: EvaluationResultInput)', 'append evaluation result operation')
requireText(engine, 'scorecard(request: EvaluationScorecardRequest)', 'read-only scorecard operation')
requireText(engine, 'score must be between 0 and 1', 'bounded normalized score')
requireText(engine, 'Evaluation result requires score or pass evidence', 'evidence requirement')
requireText(engine, 'FORBIDDEN_PAYLOAD_KEYS', 'sensitive payload guard')
requireText(engine, 'chainofthought', 'hidden reasoning guard')
requireText(retrievalEvaluation, 'evaluateRetrieval', 'deterministic retrieval evaluator')
requireText(retrievalEvaluation, 'recordRetrievalEvaluation', 'canonical evaluation recording adapter')
requireText(retrievalEvaluation, 'mrrAtK', 'MRR metric')
requireText(retrievalEvaluation, 'ndcgAtK', 'nDCG metric')
requireText(retrievalEvaluation, 'recallAtK', 'Recall metric')
requireText(retrievalEvaluation, "evaluationType: 'RETRIEVAL_RELEVANCE'", 'retrieval-specific evaluation type')
requireText(retrievalEvaluation, "capability: 'retrieval'", 'retrieval capability classification')
requireText(retrievalEvaluation, 'labeled_case_ids', 'safe labeled-case evidence metadata')
requireText(benchmarkRunner, 'export async function runRetrievalBenchmark', 'offline retrieval benchmark operation')
requireText(benchmarkRunner, 'retrieval benchmark requires governed labeled cases', 'benchmark fails closed without governed labels')
requireText(benchmarkRunner, 'request.retrieval.retrieve({', 'benchmark executes the selected retrieval provider')
requireText(benchmarkRunner, 'rankedObjectKeys: response.matches.map((match) => match.objectKey)', 'benchmark ranks canonical object keys only')
requireText(benchmarkRunner, 'recordRetrievalEvaluation({', 'benchmark records metrics through canonical evaluation boundary')
requireText(benchmarkRunner, 'evidenceRefs: request.dataset.evidenceRefs', 'benchmark preserves governed label evidence references')
requireText(benchmarkRunner, 'reranker changed between labeled cases', 'benchmark rejects inconsistent reranker identity')
requireText(governedBenchmark, 'buildGovernanceRetrievalEvaluationDataset(projectId)', 'governed benchmark reads persisted label dataset')
requireText(governedBenchmark, 'createGovernanceRetrievalProvider(supabase)', 'governed benchmark uses production retrieval and reranker composition')
requireText(governedBenchmark, 'createGovernanceEvaluationEngine()', 'governed benchmark persists canonical evaluation evidence')
requireText(governedBenchmark, 'No governed retrieval relevance labels are available for this project', 'governed benchmark does not fabricate missing labels')
requireText(adapter, "from('ai_evaluation_results')", 'canonical automated evaluation ledger')
requireText(adapter, "rpc('ai_evaluation_scorecard'", 'deterministic scorecard projection')
requireText(route, 'export async function GET(request: Request)', 'read-only HTTP scorecard surface')
requireText(route, 'requireUser()', 'authenticated scorecard access')
requireText(route, "authorizeProject(user.id, projectId, 'catalog.read')", 'project-scoped scorecard authorization')
requireText(route, 'createGovernanceEvaluationEngine()', 'canonical evaluation engine adapter')
requireText(route, 'engine.scorecard({', 'scorecard-only route operation')
requireText(route, "aiSystemVersionId: optionalQuery(searchParams, 'aiSystemVersionId')", 'AI-system-version scorecard filter')
requireText(route, "evaluationType: optionalQuery(searchParams, 'evaluationType')", 'evaluation-type scorecard filter')
requireText(route, "capability: optionalQuery(searchParams, 'capability')", 'capability scorecard filter')
requireText(ledger, 'create table governance.ai_evaluation_results', 'evaluation ledger schema')
requireText(ledger, 'references governance.ai_system_versions(id) on delete restrict', 'model version evidence link')
requireText(ledger, 'references agent.agent_evaluations(id) on delete restrict', 'existing agent evaluation evidence link')
requireText(ledger, 'references governance.ai_telemetry_events(id) on delete restrict', 'telemetry evidence link')
requireText(ledger, 'enable row level security', 'RLS enabled')
requireText(ledger, 'app_private.is_project_member(project_id)', 'project-scoped read policy')
requireText(ledger, 'grant select, insert on governance.ai_evaluation_results to service_role', 'service-role append authority')
requireText(ledger, 'do not automatically create or approve governed AI-system assessments', 'assessment authority boundary')
requireText(scorecard, 'security invoker', 'scorecard does not bypass RLS by definition')
requireText(scorecard, 'grant execute on function governance.ai_evaluation_scorecard', 'explicit server-side execution grant')
requireText(scorecard, 'does not create governed assessments', 'scorecard authority boundary')

if (/grant\s+insert[^;]+authenticated/i.test(ledger)) {
  throw new Error('Authenticated clients must not receive direct automated evaluation insert authority.')
}
if (/security\s+definer/i.test(scorecard)) {
  throw new Error('Evaluation scorecard must not use SECURITY DEFINER.')
}
if (/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/.test(route)) {
  throw new Error('Evaluation scorecard route must remain read-only.')
}
if (/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/.test(route)) {
  throw new Error('Evaluation scorecard route must not write evaluation evidence directly.')
}
if (route.includes("from('ai_evaluation_results')") || route.includes("rpc('ai_evaluation_scorecard'")) {
  throw new Error('Evaluation scorecard route must use the EvaluationEngine boundary instead of direct persistence access.')
}
if (/metadata:\s*\{[^}]*\b(query|rankedObjectKeys|content|retrievedContent)\b/s.test(retrievalEvaluation)) {
  throw new Error('Retrieval evaluation persistence must not store raw query or retrieved content in metadata.')
}
for (const source of [benchmarkRunner, governedBenchmark]) {
  if (/\b(approve|activate|promote|deploy)\s*\(/i.test(source) || /lifecycle_status\s*[:=]/i.test(source)) {
    throw new Error('Retrieval benchmark evidence must not grant model approval, promotion, deployment, or lifecycle authority.')
  }
}

console.log('ADR-006 EvaluationEngine, retrieval relevance evaluation, and offline benchmark contracts verified.')

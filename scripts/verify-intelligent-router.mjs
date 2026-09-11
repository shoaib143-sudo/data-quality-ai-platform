import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
const router = read('lib', 'ai', 'intelligent-router.ts')
const registry = read('lib', 'ai', 'model-registry.ts')
const evaluation = read('lib', 'ai', 'evaluation-engine.ts')
const governanceEvaluation = read('lib', 'ai', 'governance-evaluation-engine.ts')
const routingPolicy = read('lib', 'ai', 'routing-policy.ts')
const adapter = read('lib', 'ai', 'governance-intelligent-router.ts')
const migration = read('supabase', 'migrations', '20260911160000_govern_evaluation_driven_routing.sql')
const failures = []

for (const token of [
  'EvaluationAwareIntelligentRouter',
  "routingEligibleOnly: true",
  "metric.capability === enforcedPolicy.task",
  "evaluationMode: comparableEvidence ? 'CANONICAL_EVALUATION' : 'DETERMINISTIC_FALLBACK'",
  'evaluationEvidenceResultIds',
  'evaluationLastObservedAt',
  'evaluationFallbackReason',
  'eligible.every((candidate) => candidate.evidence.averageScore !== null)',
  "source: 'GOVERNED_REGISTRY'",
  "source: 'ENVIRONMENT_FALLBACK'",
]) if (!router.includes(token)) failures.push(`missing router contract token: ${token}`)

for (const token of [
  'projectId,',
  'aiSystemVersionId: row.ai_system_version_id',
  'capability,',
]) if (!registry.includes(token)) failures.push(`model registry must scope evaluation by project, exact version, and capability: ${token}`)

for (const token of ['evidenceResultIds', 'lastObservedAt']) if (!evaluation.includes(token)) failures.push(`evaluation scorecard must expose provenance: ${token}`)
if (!governanceEvaluation.includes(".rpc('ai_evaluation_scorecard'")) failures.push('scorecard must come from canonical PostgreSQL RPC')

if (routingPolicy.includes('INSUFFICIENT_EVALUATION_SCORE') || routingPolicy.includes('INSUFFICIENT_EVALUATION_EVIDENCE')) {
  failures.push('evaluation evidence must not be an authorization decision in routing-policy.ts')
}
if (!routingPolicy.includes("'AI_SYSTEM_NOT_ALLOWED'")) failures.push('governed model allow list must remain an authorization boundary')

for (const token of [
  'evaluation_type text',
  'evaluation_metric_name text',
  'evaluation_max_age_seconds integer',
  'evidence_result_ids uuid[]',
  'last_observed_at timestamptz',
  'where r.project_id = p_project_id',
  'r.ai_system_version_id = p_ai_system_version_id',
  'r.capability = p_capability',
]) if (!migration.includes(token)) failures.push(`canonical SQL source contract missing: ${token}`)

if (!adapter.includes('createGovernanceModelRegistry()')) failures.push('governed registry not composed into router')
if (!adapter.includes('new EnvironmentModelGateway()')) failures.push('environment fallback gateway not composed')

for (const forbidden of [
  /weightedScore/,
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.upsert\s*\(/,
  /\.delete\s*\(/,
  /lifecycleStatus\s*=\s*['"]ACTIVE['"]/,
  /chain.?of.?thought/i,
]) if (forbidden.test(router) || forbidden.test(adapter)) failures.push(`forbidden routing pattern: ${forbidden}`)

if (failures.length) {
  console.error('ADR-006 evidence-driven Intelligent Router contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}

console.log('ADR-006 evidence-driven Intelligent Router contract passed.')
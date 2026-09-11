import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260908152555_add_ai_routing_policy_versions.sql', 'utf8')
const evidenceRoutingMigration = fs.readFileSync('supabase/migrations/20260911160000_govern_evaluation_driven_routing.sql', 'utf8')
const policy = fs.readFileSync('lib/ai/routing-policy.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-routing-policy.ts', 'utf8')
const router = fs.readFileSync('lib/ai/intelligent-router.ts', 'utf8')
const failures = []

for (const token of [
  'governance.ai_routing_policy_versions',
  'governance.publish_ai_routing_policy',
  'governance.resolve_ai_routing_policy',
  "'policy.approve'",
  'AI_ROUTING_POLICY_PUBLISHED',
  'ai_routing_policy_versions_immutable',
  'security invoker',
]) if (!migration.toLowerCase().includes(token.toLowerCase())) failures.push(`missing migration contract token: ${token}`)

for (const token of [
  'RoutingPolicyProvider',
  'evaluateModelAgainstRoutingPolicy',
  'AI_SYSTEM_NOT_ALLOWED',
  'evaluationType',
  'evaluationMetricName',
  'evaluationMaxAgeSeconds',
  'minEvaluationScore',
  'minScoredCount',
]) if (!policy.includes(token)) failures.push(`missing policy contract token: ${token}`)

for (const forbiddenReason of [
  'INSUFFICIENT_EVALUATION_SCORE',
  'INSUFFICIENT_EVALUATION_EVIDENCE',
]) if (policy.includes(forbiddenReason)) failures.push(`evaluation must not become authorization reason: ${forbiddenReason}`)

for (const token of [
  'evaluation_type',
  'evaluation_metric_name',
  'evaluation_max_age_seconds',
  'No cross-metric composite is permitted',
  'They are not',
  'model authorization controls',
]) if (!evidenceRoutingMigration.includes(token)) failures.push(`missing evidence-routing migration contract token: ${token}`)

if (!adapter.includes("rpc('resolve_ai_routing_policy'")) failures.push('governed policy resolver RPC not wired')
if (!router.includes('ROUTING_POLICY_UNAVAILABLE')) failures.push('router does not fail closed on policy resolution')
if (!router.includes('POLICY_DENIED_ENVIRONMENT_FALLBACK')) failures.push('router does not enforce fallback policy')
if (!router.includes('NO_GOVERNED_CANDIDATES_SATISFY_POLICY')) failures.push('router does not enforce candidate policy filtering')
if (!router.includes('DETERMINISTIC_FALLBACK')) failures.push('router does not expose deterministic evidence fallback')
if (!router.includes('CANONICAL_EVALUATION')) failures.push('router does not expose canonical evaluation selection mode')

for (const forbidden of [
  /grant\s+(insert|update|delete)[^;]+ai_routing_policy_versions[^;]+to\s+(anon|authenticated)/i,
  /grant\s+(update|delete)[^;]+ai_routing_policy_versions[^;]+to\s+service_role/i,
]) if (forbidden.test(migration)) failures.push(`forbidden routing-policy grant: ${forbidden}`)

if (failures.length) {
  console.error('ADR-006 RoutingPolicy contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}
console.log('ADR-006 RoutingPolicy contract passed.')

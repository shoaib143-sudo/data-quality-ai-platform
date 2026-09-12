import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260912173500_project_profile_readiness_v2.sql','utf8')
const admissionMigration = fs.readFileSync('supabase/migrations/20260912174600_project_profile_readiness_admission_gate.sql','utf8')
const gate = fs.readFileSync('lib/profiling/readiness-gate.ts','utf8')
const executor = fs.readFileSync('lib/agents/executors/profiling-executor.ts','utf8')
const readinessApi = fs.readFileSync('app/api/profiling/readiness/route.ts','utf8')
const datasetActions = fs.readFileSync('app/datasets/dataset-actions.tsx','utf8')

const requiredMigration = [
  'catalog.verify_dataset_profile_readiness(',
  'catalog.verify_dataset_version_profile_readiness(',
  'catalog.verify_project_profile_readiness(p_project_id uuid)',
  "when datasets_assessed = 0 then 'NOT_ASSESSED'",
  "when ready_count = datasets_assessed then 'READY'",
  "when ready_count > 0 then 'PARTIALLY_READY'",
  "when blocked_count > 0 then 'BLOCKED'",
  "dc.source_type = 'JDBC'",
  "m.complete = true",
  "m.truncated = false",
  "m.failed_item_count = 0",
  'm.completed_at is not null',
  'sc.scope_id = m.scope_id',
  'sc.scope_version_id = m.scope_version_id',
  'READINESS_RULE_NOT_ONBOARDED',
  'DATASET_VERSION_NOT_LATEST',
  'DETERMINISTIC_DERIVED_READINESS_NO_AGENT_OVERRIDE',
  'LOW_RISK_WHEN_POLICY_AUTHORIZED',
  'approval_required',
  'can_profile_any',
  'can_profile_all',
  'security invoker',
  "set search_path = ''",
  'grant execute on function catalog.verify_dataset_profile_readiness(uuid, uuid) to authenticated, service_role',
  'grant execute on function catalog.verify_dataset_version_profile_readiness(uuid, uuid) to authenticated, service_role',
  'grant execute on function catalog.verify_project_profile_readiness(uuid) to authenticated, service_role',
]

for (const marker of requiredMigration) {
  if (!migration.includes(marker)) throw new Error('Profile readiness V2 contract missing: ' + marker)
}

if (/\bsecurity\s+definer\b/i.test(migration)) throw new Error('Profile readiness verification must remain SECURITY INVOKER')
if (/\b(update|insert\s+into|delete\s+from|truncate)\s+(catalog|profiling)\./i.test(migration)) throw new Error('Profile readiness verifier migration must remain derived/read-only')
if (/grant\s+execute[^;]+\b(public|anon)\b/i.test(migration)) throw new Error('Anonymous profile-readiness execution must remain revoked')
if (/else\s+true\s+end\s+as\s+discovery_evidence_ready/i.test(migration)) throw new Error('Unknown/non-JDBC source types must not silently pass readiness')
if (!/join\s+active_scope\s+sc[\s\S]+sc\.scope_version_id\s*=\s*m\.scope_version_id/i.test(migration)) throw new Error('Successful discovery evidence must be bound to the current active scope version')

const requiredAdmission = [
  'profiling.enforce_profile_run_readiness()',
  'before insert on profiling.profile_runs',
  'catalog.verify_dataset_version_profile_readiness(',
  "<> 'READY'",
  'PROFILE_READINESS_GATE_BLOCKED',
  'PROFILE_READINESS_DATASET_VERSION_NOT_FOUND',
  'security invoker',
  "set search_path = ''",
]
for (const marker of requiredAdmission) {
  if (!admissionMigration.toLowerCase().includes(marker.toLowerCase())) throw new Error('Profile-run admission gate missing: ' + marker)
}
if (/security\s+definer/i.test(admissionMigration)) throw new Error('Profile-run readiness admission guard must remain SECURITY INVOKER')

const requiredGate = [
  "readonly code = 'PROFILE_READINESS_GATE_BLOCKED'",
  "readiness.state !== 'READY'",
  'readiness.profiling_ready !== true',
  ".schema('catalog')",
  ".rpc('verify_dataset_version_profile_readiness'",
]
for (const marker of requiredGate) if (!gate.includes(marker)) throw new Error('Readiness runtime gate missing: ' + marker)

const requiredExecutor = [
  'PROFILE_READINESS_GATED_OPERATIONS',
  "'profile_dataset'",
  "'execute_metrics'",
  'assertDatasetVersionProfileReady(projectId, suppliedDatasetVersionId)',
  'PROFILE_READINESS_CONFIRMED',
]
for (const marker of requiredExecutor) if (!executor.includes(marker)) throw new Error('Profiling executor readiness enforcement missing: ' + marker)

for (const diagnosticOperation of ['investigate_profile', 'detect_patterns', 'infer_candidate_keys']) {
  const gateSetMatch = executor.match(/PROFILE_READINESS_GATED_OPERATIONS\s*=\s*new Set\(\[([\s\S]*?)\]\)/)
  if (gateSetMatch?.[1]?.includes(`'${diagnosticOperation}'`)) throw new Error(`Diagnostic operation ${diagnosticOperation} must remain available while readiness is blocked`)
}

const requiredApi = [
  'requireApiUser()',
  "authorizeDatasetVersion(user.id, datasetVersionId, 'profiling.execute')",
  "rpc('verify_dataset_version_profile_readiness'",
  'PROFILE_READINESS_PROJECT_MISMATCH',
]
for (const marker of requiredApi) if (!readinessApi.includes(marker)) throw new Error('Readiness API authorization/contract missing: ' + marker)

const requiredUi = [
  '/api/profiling/readiness?',
  "readiness?.state === 'READY'",
  'Try automated repair',
  '/api/datasets/source/validate',
  'primaryRemediation?.root_cause',
  'primaryRemediation.manual_action',
  'AI guidance:',
  'await refreshReadiness()',
]
for (const marker of requiredUi) if (!datasetActions.includes(marker)) throw new Error('Dataset readiness UI integration missing: ' + marker)
if (datasetActions.includes('if (!ready ||')) throw new Error('Legacy readiness boolean must not remain the execution authority in DatasetActions')

console.log('Project profile readiness V2 contract verified: deterministic states, current-scope successful evidence, DB admission backstop, runtime gate, authorized UI evidence, manual repair, automated low-risk repair, and diagnostic access preserved.')

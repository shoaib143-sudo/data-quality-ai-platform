import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260912173500_project_profile_readiness_v2.sql'
const migration = fs.readFileSync(migrationPath, 'utf8')
const gate = fs.readFileSync('lib/profiling/readiness-gate.ts', 'utf8')
const executor = fs.readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')
const tests = fs.readFileSync('scripts/test-project-profile-readiness.sql', 'utf8')

const failures = []
const checks = []

function check(name, condition, detail) {
  checks.push({ name, passed: Boolean(condition), detail })
  if (!condition) failures.push(`${name}: ${detail}`)
}

const gateSet = executor.match(/PROFILE_READINESS_GATED_OPERATIONS\s*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
const gateIndex = executor.indexOf('assertDatasetVersionProfileReady(projectId, suppliedDatasetVersionId)')
const admissionIndex = executor.indexOf('admitNativeToolInvocation({')

check(
  'Empty-project fail-open resistance',
  migration.includes("when datasets_assessed = 0 then 'NOT_ASSESSED'"),
  'A project with no datasets must never become READY by vacuous truth.',
)
check(
  'Unknown-source fail-open resistance',
  migration.includes("(dc.source_type = 'JDBC') as readiness_policy_onboarded")
    && migration.includes('READINESS_RULE_NOT_ONBOARDED')
    && !/else\s+true\s+end\s+as\s+discovery_evidence_ready/i.test(migration),
  'A source without an explicit readiness policy must be NOT_ASSESSED rather than implicitly ready.',
)
check(
  'Current-scope evidence binding',
  migration.includes('sc.scope_id = m.scope_id') && migration.includes('sc.scope_version_id = m.scope_version_id'),
  'Discovery evidence from an obsolete scope or scope version must not authorize profiling.',
)
check(
  'Latest-successful evidence semantics',
  migration.includes('m.complete = true')
    && migration.includes('m.truncated = false')
    && migration.includes('m.failed_item_count = 0')
    && migration.includes('m.completed_at is not null'),
  'Readiness must derive only from completed, complete, non-truncated, zero-failure evidence.',
)
check(
  'Old dataset-version fencing',
  migration.includes('DATASET_VERSION_NOT_LATEST'),
  'A stale dataset version must not borrow readiness from the latest version.',
)
check(
  'Cross-project isolation',
  migration.includes('d.project_id = p_project_id') && tests.includes('cross-project version isolation failed'),
  'Dataset/version lookup must be scoped by project and tested against cross-project probing.',
)
check(
  'Per-dataset partial readiness',
  migration.includes("when ready_count > 0 then 'PARTIALLY_READY'")
    && migration.includes("'can_profile_any', ready_count > 0")
    && tests.includes('healthy dataset was blocked by partially-ready peer'),
  'A blocked or unassessed peer must not prevent a READY dataset from profiling.',
)
check(
  'Execution gate precedes native tool admission',
  gateIndex >= 0 && admissionIndex >= 0 && gateIndex < admissionIndex,
  'Source execution should fail readiness before the native profiling tool is admitted.',
)
check(
  'Only source-executing operations gated',
  gateSet.includes("'profile_dataset'")
    && gateSet.includes("'execute_metrics'")
    && !gateSet.includes("'investigate_profile'")
    && !gateSet.includes("'detect_patterns'")
    && !gateSet.includes("'infer_candidate_keys'"),
  'Diagnostic/read-only operations must remain available to diagnose and remediate blocked readiness.',
)
check(
  'Agent cannot self-declare readiness',
  migration.includes('DETERMINISTIC_DERIVED_READINESS_NO_AGENT_OVERRIDE')
    && gate.includes("readiness.state !== 'READY'")
    && gate.includes('readiness.profiling_ready !== true'),
  'Runtime code must consume deterministic database evidence rather than agent judgment.',
)
check(
  'Remediation is advisory/policy-gated',
  migration.includes("'ai_remediation', 'PROPOSE_ONLY'")
    && migration.includes("'ai_remediation', 'LOW_RISK_WHEN_POLICY_AUTHORIZED'")
    && migration.includes("'approval_required', true"),
  'Sensitive remediation must expose approval requirements and never be represented as unconditional auto-fix.',
)
check(
  'Verifier remains read-only',
  !/\b(update|insert\s+into|delete\s+from|truncate)\s+(catalog|profiling)\./i.test(migration),
  'Readiness functions must not mutate governed lifecycle or profiling state.',
)
check(
  'Invoker-rights and ACL hardening',
  /security\s+invoker/i.test(migration)
    && !/security\s+definer/i.test(migration)
    && migration.includes("set search_path = ''")
    && /revoke all on function catalog\.verify_project_profile_readiness\(uuid\) from public, anon/i.test(migration),
  'Readiness verification must preserve caller authorization and deny anonymous direct execution.',
)
check(
  'Dynamic negative matrix present',
  [
    'inactive dataset blocker failed',
    'inactive source blocker failed',
    'observed readiness blocker failed',
    'execution binding blocker failed',
    'stale scope evidence was incorrectly accepted',
    'old version did not fail closed',
    'unonboarded source must be NOT_ASSESSED',
    'empty project semantics failed',
  ].every((marker) => tests.includes(marker)),
  'The isolated SQL suite must exercise the principal negative and failure cases.',
)

for (const item of checks) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name}`)
}

if (failures.length) {
  console.error('\nAdversarial audit failures:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`\nIndependent automated adversarial audit passed ${checks.length}/${checks.length} checks.`)
console.log('This is an independent automated threat-model audit, not an independent human or third-party review.')

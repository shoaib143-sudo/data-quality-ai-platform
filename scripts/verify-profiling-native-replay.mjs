import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationPath = 'supabase/migrations/20260912003000_profiling_readonly_native_replay_certification.sql'
const migration = readFileSync(migrationPath, 'utf8')
const derived = readFileSync('lib/profiling/derived-tools.ts', 'utf8')
const executor = readFileSync('lib/profiling/executor.ts', 'utf8')

const certifiedTools = [
  'inspect_dataset',
  'infer_column_types',
  'get_profile_run',
  'detect_patterns',
  'infer_candidate_keys',
  'detect_outliers',
  'detect_sensitive_columns',
  'detect_duplicates',
]

const mutableTools = [
  'profile_dataset',
  'execute_metrics',
  'investigate_profile',
  'compare_profiles',
  'persist_profile_snapshot',
  'complete_profile_run',
]

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

function sliceBetween(source, start, end, label) {
  const startIndex = source.indexOf(start)
  assert.ok(startIndex >= 0, `${label} start marker is missing: ${start}`)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.ok(endIndex > startIndex, `${label} end marker is missing: ${end}`)
  return source.slice(startIndex, endIndex)
}

function assertNoWrites(source, label) {
  for (const token of ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']) {
    assert.equal(source.includes(token), false, `${label} must remain read-only; found ${token}`)
  }
}

contains(migration, "d.agent_key = 'profiling_agent'", 'profiling agent scope')
contains(migration, "d.version = '2.0'", 'production profiling definition scope')
contains(migration, "set version = '2.1'", 'certified contract version')
contains(migration, "'read_only', true", 'read-only certification')
contains(migration, "'idempotent', true", 'idempotent certification')
contains(migration, "'replay_certified', true", 'replay certification')
contains(migration, "'destructive', false", 'non-destructive certification')
contains(migration, "'privileged', false", 'non-privileged certification')
contains(migration, "'governance_authority_change', false", 'governance authority guard')
contains(migration, "'approval_required', false", 'approval certification')
contains(migration, "'retryable_error_codes', jsonb_build_array('STEP_FAILED')", 'bounded read-only retry certification')
contains(migration, 'v_expected constant integer := 8', 'database postcondition')

for (const tool of certifiedTools) contains(migration, `'${tool}'`, `${tool} certification`)

const certificationArrayMatch = migration.match(/t\.tool_key = any\(array\[([\s\S]*?)\]::text\[\]\);/)
assert.ok(certificationArrayMatch, 'Unable to locate the certified profiling tool array')
const migrationTools = [...certificationArrayMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
assert.deepEqual(migrationTools, certifiedTools, 'Only the proven read-only profiling tools may be replay certified')
for (const tool of mutableTools) assert.equal(migrationTools.includes(tool), false, `${tool} must remain uncertified in this slice`)

const derivedReadOnly = sliceBetween(
  derived,
  'export async function detectPatterns',
  'export async function compareProfiles',
  'derived profiling read-only tools',
)
assertNoWrites(derivedReadOnly, 'derived profiling read-only tools')
for (const functionName of ['detectPatterns', 'inferCandidateKeys', 'detectOutliers', 'detectSensitiveColumns', 'detectDuplicates']) {
  contains(derivedReadOnly, `function ${functionName}`, `${functionName} implementation`)
}

const inferColumnTypes = sliceBetween(
  executor,
  'async function inferColumnTypes',
  'async function profileDataset',
  'inferColumnTypes',
)
assertNoWrites(inferColumnTypes, 'inferColumnTypes')

const inspectDataset = sliceBetween(
  executor,
  'async function inspectDataset',
  'async function getProfileRun',
  'inspectDataset',
)
assertNoWrites(inspectDataset, 'inspectDataset')

const getProfileRun = sliceBetween(
  executor,
  'async function getProfileRun',
  'async function persistProfileSnapshot',
  'getProfileRun',
)
assertNoWrites(getProfileRun, 'getProfileRun')

for (const token of [
  "case 'inspect_dataset':",
  "case 'get_profile_run':",
  "case 'infer_column_types':",
  "case 'detect_patterns':",
  "case 'infer_candidate_keys':",
  "case 'detect_outliers':",
  "case 'detect_sensitive_columns':",
  "case 'detect_duplicates':",
]) contains(executor, token, 'profiling executor routing')

console.log('Profiling native read-only replay certification verified.')

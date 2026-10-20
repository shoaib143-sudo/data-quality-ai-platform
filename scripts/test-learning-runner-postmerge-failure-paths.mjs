import assert from 'node:assert/strict'
import fs from 'node:fs'

const artifacts=fs.readFileSync('lib/agents/learning-runner-artifacts.ts','utf8')
const activation=fs.readFileSync('lib/agents/learning-runner-activation.ts','utf8')
const replay=fs.readFileSync('lib/agents/learning-runner-replay.ts','utf8')
const synthetic=fs.readFileSync('lib/agents/learning-runner-synthetic.ts','utf8')
const migration=fs.readFileSync('supabase/migrations/20261020120000_learning_runner_activation_bindings.sql','utf8')

// Storage corruption / partial-registration paths must fail closed.
for (const marker of [
  'LEARNING_ARTIFACT_UPLOAD_FAILED',
  'LEARNING_ARTIFACT_READBACK_FAILED',
  'LEARNING_ARTIFACT_READBACK_INTEGRITY',
  'LEARNING_ARTIFACT_LIFECYCLE_REGISTRATION_FAILED',
  'LEARNING_ARTIFACT_LIFECYCLE_LOOKUP_FAILED',
  'LEARNING_ARTIFACT_LIFECYCLE_CONFLICT',
  'LEARNING_ARTIFACT_CONCURRENT_REGISTRATION_CONFLICT',
  'LEARNING_ARTIFACT_REGISTRATION_FAILED',
  'LEARNING_ARTIFACT_BYTES_UNAVAILABLE',
  'LEARNING_ARTIFACT_BYTES_TAMPERED',
]) assert.match(artifacts,new RegExp(marker))

// Cleanup must be best-effort only and may never mask the canonical registration error.
assert.match(artifacts,/try\s*{\s*await admin\.schema\('orchestration'\).*?\.delete\(\).*?} catch\s*{/s)
assert.match(artifacts,/throw new Error\(\`LEARNING_ARTIFACT_REGISTRATION_FAILED:/)

// Replay must stay sealed + HELD_OUT + exact-version bound.
assert.match(replay,/manifest\.status!=='SEALED'/)
assert.match(replay,/caseRow\.split!=='HELD_OUT'/)
assert.match(replay,/datasetVersionId:String\(manifest\.dataset_version\)/)
assert.match(replay,/sourceRef:String\(caseRow\.source_case_ref\)/)

// Runtime activation must reject missing or mismatched canonical evidence.
for (const marker of [
  'LEARNING_RUNTIME_BINDING_MISSING',
  'LEARNING_EVALUATOR_ASSIGNMENT_MISSING',
  'LEARNING_ACTIVATION_IDENTITY_INVALID',
  'LEARNING_ACTIVATION_HASH_INVALID',
  'LEARNING_EVALUATOR_NOT_INDEPENDENT',
  'LEARNING_RUNTIME_ARTIFACT_BINDING_MISSING',
  'LEARNING_MANIFEST_BINDING_INVALID',
  'LEARNING_EVALUATOR_SCOPE_MISMATCH',
]) assert.match(activation,new RegExp(marker))

// Current authority is rechecked at execution time; immutable assignment alone is insufficient.
assert.match(activation,/authorizeProject\(activation\.proposerUserId,plan\.policy\.projectId,'agent\.execute'\)/)
assert.match(activation,/authorizeProject\(activation\.evaluatorUserId,plan\.policy\.projectId,'agent\.learning\.evaluate'\)/)

// Synthetic executor can never become an accidental prospective/provider path.
assert.match(synthetic,/SYNTHETIC_EXECUTOR_PROSPECTIVE_DENIED/)
assert.match(synthetic,/costUsd:'0'/)
assert.match(synthetic,/tokens:0/)
assert.doesNotMatch(synthetic,/fetch\(|openai|anthropic|ReasoningProvider|createAdminClient/i)

// Database layer remains immutable and promotion-free.
assert.match(migration,/before update or delete/)
assert.match(migration,/using \(false\) with check \(false\)/)
assert.doesNotMatch(migration,/PROMOTE_LEARNING_CANDIDATE/)
assert.doesNotMatch(migration,/transition_agent_version_lifecycle/)

console.log('Post-merge learning failure-path audit passed: corruption, stale authority, replay drift and synthetic/prospective mixing fail closed')

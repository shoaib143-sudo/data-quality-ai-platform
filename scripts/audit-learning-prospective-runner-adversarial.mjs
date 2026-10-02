import assert from 'node:assert/strict'
import fs from 'node:fs'

const runner = fs.readFileSync(new URL('../lib/agents/learning-prospective-experiment-runner.ts', import.meta.url), 'utf8')
const adapter = fs.readFileSync(new URL('../lib/agents/governed-learning-prospective-runner.ts', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../supabase/migrations/20261002090000_learning_prospective_experiment_runner.sql', import.meta.url), 'utf8')

// Independent threat-model audit. This file intentionally does not import the
// runner implementation or reuse its unit-test helpers.

const requiredRunnerControls = [
  /LearningProspectiveRecoveryRequiredError/,
  /Existing .* attempt requires reconciliation before re-dispatch/,
  /baselineEvidenceRef === candidateEvidenceRef/,
  /complete locked held-out partition/,
  /evidenceClass: LearningProspectiveEvidenceClass/,
  /SYNTHETIC_REHEARSAL/,
  /LIVE_PROSPECTIVE/,
  /attemptKey/,
  /createHash\('sha256'\)/,
]
for (const pattern of requiredRunnerControls) assert.match(runner, pattern)

const prohibitedRunnerAuthority = [
  /activateGovernedLearningCandidate/,
  /startGovernedLearningCanary/,
  /PROMOTE_LEARNING_CANDIDATE/,
  /assign_agent_approval_authority/,
  /transitionAgentVersionLifecycle/,
]
for (const pattern of prohibitedRunnerAuthority) assert.doesNotMatch(runner, pattern)

const requiredDatabaseControls = [
  /unique \(experiment_run_id, case_key, arm\)/,
  /unique \(project_id, attempt_key\)/,
  /split='HELD_OUT'/,
  /sample_size <> v_manifest\.held_out_case_count/,
  /case evaluator does not match locked independent evaluator/,
  /case evaluation evidence does not match successful paired attempts/,
  /experiment contains non-successful attempts/,
  /status in \('PREPARED','RUNNING','COMPLETED','FAILED','CANCELLED'\)/,
  /evidence_class in \('SYNTHETIC_REHEARSAL','LIVE_PROSPECTIVE'\)/,
]
for (const pattern of requiredDatabaseControls) assert.match(migration, pattern)

// Browser roles are read-only; mutation is service-role RPC only.
assert.match(migration, /revoke all on agent\.learning_prospective_experiment_runs from public, anon, authenticated, service_role/)
assert.match(migration, /grant select on agent\.learning_prospective_experiment_runs to authenticated, service_role/)
assert.doesNotMatch(migration, /grant (insert|update|delete).*authenticated/i)
assert.match(migration, /grant execute on function agent\.begin_learning_prospective_experiment[\s\S]*to service_role/)

// The adapter must reject a stale/ambiguous newer policy and verify the sealed manifest.
assert.match(adapter, /Locked learning evaluation policy is stale or chronology is ambiguous/)
assert.match(adapter, /Sealed learning dataset manifest does not match locked policy/)
assert.match(adapter, /Held-out case inventory does not match sealed manifest/)

// The runner must remain execution-port based. A concrete LIVE executor requires
// separate exact-runtime identity binding; this audit prevents accidental hidden
// direct provider invocation from bypassing that future binding.
assert.doesNotMatch(runner, /createGovernance.*Provider|generateJson\(|fetch\(|openai|anthropic/i)
assert.match(runner, /LearningProspectiveArmExecutor/)

// Evidence-class separation must be persisted, not merely a TypeScript annotation.
assert.match(migration, /evidence_class text not null/)
assert.match(migration, /v_existing\.evidence_class <> p_evidence_class/)

console.log('Independent prospective runner adversarial audit passed: replay, sampling, evidence, authority and synthetic/live boundaries remain fail-closed')

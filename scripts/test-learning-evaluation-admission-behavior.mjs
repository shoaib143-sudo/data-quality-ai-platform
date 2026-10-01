import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { setResponses, getCalls } from './fixtures/learning-evaluation-admin.mjs'

const mockUrl = new URL('./fixtures/learning-evaluation-admin.mjs', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@/lib/supabase/admin') return next(mockUrl, context)
  return next(specifier, context)
} })
const { loadLearningReleaseAdmission } = await import('../lib/agents/governed-learning-evaluation-service.ts')
const policy = {
  id: 'policy-record', policy_key: 'policy-key', project_id: 'project', candidate_id: 'candidate',
  created_at: '2026-09-30T02:00:00Z', dataset_manifest_id: 'manifest', agent_key: 'profiling_agent',
  skill_key: 'profile_evidence_analysis', mode: 'GUIDED', dataset_version_ids: ['dataset-version'],
  baseline_version: '1', candidate_version: '2', rollback_ref: 'rollback:1',
  evaluator_actor_id: 'reviewer', proposer_actor_id: 'proposer', rubric_ref: 'rubric', calibration_ref: 'calibration',
  manifest_hash: `sha256:${'a'.repeat(64)}`, locked_at: '2026-09-30T01:00:00Z',
  primary_metric: 'quality', analysis_plan_ref: 'analysis', sample_size: 100,
  minimum_gain: 0.05, minimum_score: 0.8, total_cost_budget: 0, per_run_cost_budget: 0,
  total_token_budget: 0, per_run_token_budget: 0, latency_ms_budget: 1000,
}
const result = {
  id: 'decision', policy_id: 'policy-record', candidate_id: 'candidate', created_at: '2026-09-30T04:00:00Z',
  observed_at: '2026-09-30T03:00:00Z', sample_count: 100, baseline_score: 0.7, candidate_score: 0.9,
  gain_lower_confidence_bound: 0.1, independently_verified: true, evidence_complete: true,
  confirmation_window_passed: true, authority_violations: 0, safety_failures: 0,
  accounting_complete: true, total_cost: 0, max_run_cost: 0, total_tokens: 0, max_run_tokens: 0,
  max_latency_ms: 100, disposition: 'REVIEW_REQUIRED', quality: 'IMPROVED',
  reasons: ['POSITIVE_GAIN_REQUIRES_RELEASE_REVIEW'], automatic_promotion_allowed: false,
}
const binding = {
  id: 'binding', run_id: 'run', evaluation_result_id: 'decision', analysis_evidence_ref: 'analysis:1',
  created_at: '2026-09-30T04:01:00Z',
  learning_experiment_runs: { id: 'run', evidence_class: 'PROSPECTIVE_LIVE', policy_id: 'policy-record', candidate_id: 'candidate' },
}
const data = value => ({ data: value, error: null })
const load = () => loadLearningReleaseAdmission({ projectId: 'project', candidateId: 'candidate' })
const bound = (policyRows=[policy], resultRows=[result], bindingRows=[binding]) => [data(policyRows), data(resultRows), data(bindingRows)]
setResponses(bound())
const admission = await load()
assert.equal(admission.evaluationResultId, 'decision')
assert.equal(admission.decision.quality, 'IMPROVED')
const calls = getCalls()
assert.deepEqual(calls.map(c => c.limit), [2, 2, 2])
assert.ok(calls.every(c => c.filters.some(([key, value]) => key === 'project_id' && value === 'project')))
assert.ok(calls[1].filters.some(([key, value]) => key === 'policy_id' && value === 'policy-record'))
assert.ok(calls.every(c => !c.filters.some(([key]) => key === 'quality')))
assert.ok(calls.slice(0,2).every(c => c.orders[0][0] === 'created_at' && c.orders[0][1].ascending === false))

setResponses(bound([policy, { ...policy, id: 'old-policy', created_at: '2026-09-30T01:30:00Z' }], [result, { ...result, id: 'old-decision', created_at: '2026-09-30T03:30:00Z' }]))
assert.equal((await load()).evaluationResultId, 'decision')

setResponses([data([])])
await assert.rejects(load, /locked prospective evaluation policy/)
setResponses([data([policy]), data([])])
await assert.rejects(load, /latest prospective evaluation policy has no recorded decision/)
setResponses([data([{ ...policy, id: 'new-policy' }, { ...policy, created_at: '2026-09-30T01:30:00Z' }]), data([])])
await assert.rejects(load, /latest prospective evaluation policy has no recorded decision/)
assert.ok(getCalls()[1].filters.some(([key, value]) => key === 'policy_id' && value === 'new-policy'))
for (const quality of ['INCONCLUSIVE', 'REGRESSED']) {
  setResponses([data([policy]), data([{ ...result, quality }, { ...result, created_at: '2026-09-30T03:30:00Z' }])])
  await assert.rejects(load, /not eligible for release review/)
}
for (const disposition of ['STOPPED', 'REJECTED']) {
  setResponses([data([policy]), data([{ ...result, disposition }])])
  await assert.rejects(load, /not eligible for release review/)
}
setResponses([data([policy, { ...policy, id: 'old-policy', created_at: policy.created_at }])])
await assert.rejects(load, /chronology is ambiguous/)
setResponses([data([policy]), data([result, { ...result, id: 'rejection', quality: 'INCONCLUSIVE', disposition: 'REJECTED' }])])
await assert.rejects(load, /chronology is ambiguous/)
setResponses([data([{ ...policy, created_at: 'invalid' }])])
await assert.rejects(load, /invalid creation time/)
for (const patch of [
  { sample_count: 1 }, { candidate_score: 0.7, gain_lower_confidence_bound: 0 },
  { accounting_complete: false }, { total_cost: 1 }, { authority_violations: 1 },
  { confirmation_window_passed: false }, { automatic_promotion_allowed: true },
]) {
  setResponses(bound([policy], [{ ...result, ...patch }]))
  await assert.rejects(load, /not eligible for release review/)
}
setResponses([{ data: null, error: { message: 'database unavailable' } }])
await assert.rejects(load, /Unable to load latest learning evaluation policy/)
setResponses([data([policy]), { data: null, error: { message: 'database unavailable' } }])
await assert.rejects(load, /Unable to load latest learning evaluation decision/)
setResponses([data([policy]), data([result]), data([])])
await assert.rejects(load, /exactly one canonical prospective experiment binding/)
setResponses([data([policy]), data([result]), data([{ ...binding, learning_experiment_runs: { ...binding.learning_experiment_runs, evidence_class: 'SYNTHETIC' } }])])
await assert.rejects(load, /binding is invalid or synthetic/)
setResponses([data([policy]), data([result]), { data: null, error: { message: 'binding database unavailable' } }])
await assert.rejects(load, /Unable to load canonical experiment decision binding/)
console.log('Release admission executes latest-policy/result queries, reclassifies evidence, blocks stale positives, database failures and ambiguous chronology.')

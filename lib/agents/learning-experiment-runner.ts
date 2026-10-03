import { createHash } from 'node:crypto'
import { validateLearningEvaluationPolicy, type LearningEvaluationPolicy } from './learning-evaluation-policy'

/** Server-owned contracts. No route-provided plan or adapter grants authority. */
export type RunnerArtifact = { ref: string; hash: string; bytes: string }
export type RunnerCase = { caseKey: string; datasetVersionId: string; split: 'held_out'; input: RunnerArtifact }
export type RunnerAttemptIdentity = {
  projectId: string; policyId: string; candidateId: string; runId: string
  caseKey: string; datasetVersionId: string; arm: 'baseline' | 'candidate'; attempt: 1; artifactHash: string; executionManifestHash: string
}
export type RunnerArmOutcome = {
  identity: RunnerAttemptIdentity; inputHash: string; output: RunnerArtifact
  provenance: 'synthetic' | 'prospective'; invocationId: string
  reservationId: string | null; settlementId: string | null; costEventId: string | null
  costUsd: string; tokens: number; latencyMs: number
}
export type RunnerAttemptClaim =
  | { status: 'acquired'; claimId: string }
  | { status: 'completed'; outcome: RunnerArmOutcome }
  | { status: 'ambiguous' | 'cancelled' | 'failed' }
export interface LearningExperimentRunnerStore {
  /** Atomic immutable claim. An unresolved prior claim is ambiguous, never acquired. */
  claimDispatch(identity: RunnerAttemptIdentity, inputHash: string): Promise<RunnerAttemptClaim>
  /** Atomically persist terminal evidence, binding the exact immutable claim. */
  completeDispatch(claimId: string, outcome: RunnerArmOutcome): Promise<void>
  isCancelled(runId: string): Promise<boolean>
}
export type LearningExperimentRunnerPlan = {
  runId: string; policyRecordId: string; provenance: 'synthetic' | 'prospective'; policy: LearningEvaluationPolicy
  baseline: RunnerArtifact; candidate: RunnerArtifact
  cases: readonly RunnerCase[]; trainingCaseKeys: readonly string[]
  /** Hash of the exact executable artifacts and ordered replay inputs, locked before dispatch. */
  executionManifestHash: string
}
export type RunnerAuthorization = {
  projectId: string; policyId: string; proposerActorId: string; evaluatorActorId: string
  executeAllowed: boolean; evaluatorAllowed: boolean; independenceVerified: boolean
  sourceRemediationAllowed: false
}
export interface LearningExperimentRunnerPorts {
  loadServerPlan(runId: string): Promise<LearningExperimentRunnerPlan>
  authorize(plan: Readonly<LearningExperimentRunnerPlan>): Promise<RunnerAuthorization>
  store: LearningExperimentRunnerStore
  /** Prospective adapter must use the existing quoted budget invocation guard.
   * Synthetic adapter must perform no provider calls or live evidence writes. */
  execute(input: { identity: RunnerAttemptIdentity; input: Readonly<RunnerArtifact>; executable: Readonly<RunnerArtifact>; provenance: 'synthetic' | 'prospective'; signal?: AbortSignal }): Promise<RunnerArmOutcome>
  /** Resolve artifacts/accounting from canonical persistence, not outcome assertions. */
  verifyCanonicalOutcome(outcome: Readonly<RunnerArmOutcome>, plan: Readonly<LearningExperimentRunnerPlan>): Promise<boolean>
}
export type LearningExperimentRunnerResult = {
  status: 'PREPARED' | 'COMPLETED' | 'STOPPED' | 'CANCELLED'
  reason: string; outcomes: RunnerArmOutcome[]; automaticPromotionAllowed: false
}
const HASH = /^sha256:[a-f0-9]{64}$/
const CASE = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function runnerHash(bytes: string): string { return `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}` }
function artifact(value: RunnerArtifact): void {
  if (!value || !value.ref?.trim() || typeof value.bytes !== 'string' || !HASH.test(value.hash) || runnerHash(value.bytes) !== value.hash) throw new Error('RUNNER_ARTIFACT_INTEGRITY')
}
/** This digest is additional to the existing split manifest, which does not hash source bytes. */
export function learningRunnerExecutionManifestHash(plan: Omit<LearningExperimentRunnerPlan, 'executionManifestHash'>): string {
  return runnerHash(JSON.stringify({ policy: plan.policy, policyRecordId: plan.policyRecordId, trainingCaseKeys: plan.trainingCaseKeys, projectId: plan.policy.projectId, policyId: plan.policy.policyId,
    candidateId: plan.policy.candidateId, runId: plan.runId, provenance: plan.provenance,
    manifestHash: plan.policy.manifestHash, baselineVersion: plan.policy.baselineVersion,
    candidateVersion: plan.policy.candidateVersion, baseline: [plan.baseline.ref, plan.baseline.hash],
    candidate: [plan.candidate.ref, plan.candidate.hash], cases: plan.cases.map(c => [c.caseKey, c.datasetVersionId, c.split, c.input.ref, c.input.hash]) }))
}
function validatePlan(plan: LearningExperimentRunnerPlan): void {
  validateLearningEvaluationPolicy(plan.policy)
  for (const value of [plan.runId, plan.policyRecordId, plan.policy.projectId, plan.policy.candidateId]) if (!UUID.test(value)) throw new Error('RUNNER_SCOPE_INVALID')
  if (!['synthetic', 'prospective'].includes(plan.provenance)) throw new Error('RUNNER_PROVENANCE_INVALID')
  artifact(plan.baseline); artifact(plan.candidate)
  if (plan.baseline.hash === plan.candidate.hash || plan.baseline.ref === plan.candidate.ref) throw new Error('RUNNER_IDENTICAL_EXECUTABLE')
  if (plan.cases.length !== plan.policy.sampleSize) throw new Error('RUNNER_SAMPLE_MISMATCH')
  const keys = new Set<string>(), refs = new Set<string>(), hashes = new Set<string>(), training = new Set(plan.trainingCaseKeys)
  if (plan.trainingCaseKeys.some(k => !CASE.test(k))) throw new Error('RUNNER_TRAINING_KEYS_INVALID')
  for (const item of plan.cases) {
    artifact(item.input)
    if (!CASE.test(item.caseKey) || keys.has(item.caseKey) || training.has(item.caseKey) || refs.has(item.input.ref)
      || hashes.has(item.input.hash) || item.split !== 'held_out' || !plan.policy.datasetVersionIds.includes(item.datasetVersionId)) throw new Error('RUNNER_CASE_BINDING_INVALID')
    keys.add(item.caseKey); refs.add(item.input.ref); hashes.add(item.input.hash)
  }
  if (!HASH.test(plan.executionManifestHash) || learningRunnerExecutionManifestHash(plan) !== plan.executionManifestHash) throw new Error('RUNNER_EXECUTION_MANIFEST_INTEGRITY')
}
function sameIdentity(a: RunnerAttemptIdentity, b: RunnerAttemptIdentity): boolean {
  return (['projectId','policyId','candidateId','runId','caseKey','datasetVersionId','arm','attempt','artifactHash','executionManifestHash'] as const).every(k => a[k] === b[k])
}
function validateOutcome(outcome: RunnerArmOutcome, identity: RunnerAttemptIdentity, inputHash: string, provenance: LearningExperimentRunnerPlan['provenance']): void {
  if (!outcome || !sameIdentity(outcome.identity, identity) || outcome.inputHash !== inputHash || outcome.provenance !== provenance) throw new Error('RUNNER_OUTCOME_BINDING_INVALID')
  artifact(outcome.output)
  if (!UUID.test(outcome.invocationId) || (typeof outcome.costUsd !== 'string' || outcome.costUsd.length > 100 || !/^\d+(?:\.\d+)?$/.test(outcome.costUsd)) || !Number.isSafeInteger(outcome.tokens) || outcome.tokens < 0 || !Number.isSafeInteger(outcome.latencyMs) || outcome.latencyMs < 0) throw new Error('RUNNER_ACCOUNTING_INVALID')
  if (provenance === 'synthetic') {
    if (Number(outcome.costUsd) !== 0 || outcome.reservationId || outcome.settlementId || outcome.costEventId) throw new Error('RUNNER_SYNTHETIC_LIVE_CONTAMINATION')
  } else if (![outcome.reservationId, outcome.settlementId, outcome.costEventId].every(id => typeof id === 'string' && UUID.test(id))) throw new Error('RUNNER_ACCOUNTING_MISSING')
}
function immutable<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value) }
  return value
}
/** Default is read-only preparation. Explicit dispatch still requires server authorization.
 * Durable claims prevent silent retries after crashes, cancellation or persistence failure. */
export async function runLearningExperiment(input: {
  runId: string; ports: LearningExperimentRunnerPorts; dispatch?: boolean; signal?: AbortSignal
}): Promise<LearningExperimentRunnerResult> {
  const outcomes: RunnerArmOutcome[] = []
  const invocations = new Set<string>(), outputRefs = new Set<string>(), accountingRefs = new Set<string>()
  const remember = (outcome: RunnerArmOutcome) => {
    const accounting = [outcome.reservationId, outcome.settlementId, outcome.costEventId].filter((ref): ref is string => ref !== null)
    if (invocations.has(outcome.invocationId) || outputRefs.has(outcome.output.ref) || accounting.some(ref => accountingRefs.has(ref))) throw new Error('RUNNER_DUPLICATE_EVIDENCE')
    invocations.add(outcome.invocationId); outputRefs.add(outcome.output.ref)
    accounting.forEach(ref => accountingRefs.add(ref)); outcomes.push(outcome)
  }
  const result = (status: LearningExperimentRunnerResult['status'], reason: string): LearningExperimentRunnerResult => ({ status, reason, outcomes, automaticPromotionAllowed: false })
  try {
    if (!UUID.test(input.runId)) throw new Error('RUNNER_RUN_ID_INVALID')
    const plan = immutable(structuredClone(await input.ports.loadServerPlan(input.runId)))
    if (plan.runId !== input.runId) throw new Error('RUNNER_RUN_SCOPE_MISMATCH')
    validatePlan(plan)
    const cancelled = async () => input.signal?.aborted === true || await input.ports.store.isCancelled(plan.runId)
    const authorized = async () => {
      const a = await input.ports.authorize(plan)
      if (a.projectId !== plan.policy.projectId || a.policyId !== plan.policy.policyId
        || a.proposerActorId !== plan.policy.proposerActorId || a.evaluatorActorId !== plan.policy.evaluatorActorId
        || a.executeAllowed !== true || a.evaluatorAllowed !== true || a.independenceVerified !== true || a.sourceRemediationAllowed !== false) throw new Error('RUNNER_AUTHORIZATION_DENIED')
    }
    await authorized()
    if (await cancelled()) return result('CANCELLED', 'RUNNER_CANCELLED')
    if (input.dispatch !== true) return result('PREPARED', 'RUNNER_DISPATCH_DISABLED')
    for (const item of plan.cases) for (const arm of ['baseline', 'candidate'] as const) {
      await authorized()
      if (await cancelled()) return result('CANCELLED', 'RUNNER_CANCELLED')
      const executable = plan[arm]
      const identity = immutable<RunnerAttemptIdentity>({ projectId: plan.policy.projectId, policyId: plan.policyRecordId,
        candidateId: plan.policy.candidateId, runId: plan.runId, caseKey: item.caseKey,
        datasetVersionId: item.datasetVersionId, arm, attempt: 1, artifactHash: executable.hash, executionManifestHash: plan.executionManifestHash })
      const claim = await input.ports.store.claimDispatch(identity, item.input.hash)
      if (claim.status !== 'acquired' && claim.status !== 'completed') return result('STOPPED', `RUNNER_PRIOR_${claim.status.toUpperCase()}`)
      if (claim.status === 'completed') {
        const saved = immutable(structuredClone(claim.outcome))
        validateOutcome(saved, identity, item.input.hash, plan.provenance)
        if (!await input.ports.verifyCanonicalOutcome(saved, plan)) throw new Error('RUNNER_CANONICAL_EVIDENCE_INVALID')
        remember(saved); continue
      }
      if (!UUID.test(claim.claimId)) throw new Error('RUNNER_CLAIM_INVALID')
      // Never reclaim this dispatch after this point. Even an abort can hide an accepted provider call.
      if (await cancelled()) return result('CANCELLED', 'RUNNER_CANCELLED_AFTER_CLAIM')
      await authorized()
      const outcome = immutable(structuredClone(await input.ports.execute({ identity, input: item.input, executable, provenance: plan.provenance, signal: input.signal })))
      validateOutcome(outcome, identity, item.input.hash, plan.provenance)
      if (!await input.ports.verifyCanonicalOutcome(outcome, plan)) throw new Error('RUNNER_CANONICAL_EVIDENCE_INVALID')
      if (invocations.has(outcome.invocationId) || outputRefs.has(outcome.output.ref) || [outcome.reservationId, outcome.settlementId, outcome.costEventId].some(ref => ref !== null && accountingRefs.has(ref))) throw new Error('RUNNER_DUPLICATE_EVIDENCE')
      // Preserve known accounting even when cancellation arrived during execution.
      await input.ports.store.completeDispatch(claim.claimId, outcome)
      remember(outcome)
      if (await cancelled()) return result('CANCELLED', 'RUNNER_CANCELLED_AFTER_EXECUTION')
    }
    return result('COMPLETED', 'RUNNER_PAIRED_OUTPUTS_COMPLETE')
  } catch (error) {
    return result(input.signal?.aborted ? 'CANCELLED' : 'STOPPED', error instanceof Error ? error.message : 'RUNNER_UNKNOWN_FAILURE')
  }
}

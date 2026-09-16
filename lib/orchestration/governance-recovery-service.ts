import { createAdminClient } from '@/lib/supabase/admin'
import {
  canMarkOriginalStepSucceeded,
  classifyGovernanceFailure,
  type DebuggerInput,
  type FailureSignal,
  type RuntimeDebuggingOutcome,
} from '@/lib/orchestration/governance-recovery'

export async function recordGovernanceFailureClassification(input: {
  projectId: string
  orchestratorRunId: string
  failingRunId?: string | null
  failingStepId: string
  correlationId: string
  signal: FailureSignal
  evidenceRefs?: Array<{ type: string; id: string; hash?: string | null }>
}) {
  const classification = classifyGovernanceFailure(input.signal)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').from('governance_recovery_events').insert({
    project_id: input.projectId,
    orchestrator_run_id: input.orchestratorRunId,
    failing_run_id: input.failingRunId ?? null,
    failing_step_id: input.failingStepId,
    correlation_id: input.correlationId,
    failure_class: classification.failureClass,
    disposition: classification.disposition,
    reason: classification.reason,
    retry_allowed: classification.retryAllowed,
    evidence_refs: input.evidenceRefs ?? [],
  }).select('id').single()
  if (error || !data) throw new Error(`Unable to persist governance recovery classification: ${error?.message ?? 'unknown error'}`)
  return { recoveryEventId: String(data.id), classification }
}

export async function recordRuntimeDebuggerOutcome(input: {
  recoveryEventId: string
  outcome: RuntimeDebuggingOutcome
  originalStepReexecuted: boolean
  originalExitGatePassed: boolean
}) {
  const canSucceed = canMarkOriginalStepSucceeded({
    debuggerOutcome: input.outcome,
    originalStepReexecuted: input.originalStepReexecuted,
    originalExitGatePassed: input.originalExitGatePassed,
  })
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').from('governance_recovery_events').update({
    debugger_outcome: input.outcome,
    original_step_reexecuted: input.originalStepReexecuted,
    original_exit_gate_passed: input.originalExitGatePassed,
    updated_at: new Date().toISOString(),
  }).eq('id', input.recoveryEventId).select('id').maybeSingle()
  if (error) throw new Error(`Unable to persist runtime debugger outcome: ${error.message}`)
  if (!data) throw new Error('Governance recovery event was not found.')
  return { canMarkOriginalStepSucceeded: canSucceed }
}

export function buildBoundedDebuggerInput(input: DebuggerInput): DebuggerInput {
  const boundedLogs = Array.isArray(input.boundedLogs)
    ? input.boundedLogs.slice(0, 100).map(line => String(line).slice(0, 2000))
    : []
  const evidenceRefs = Array.isArray(input.evidenceRefs)
    ? input.evidenceRefs.slice(0, 100).map(ref => ({ type: String(ref.type), id: String(ref.id), hash: ref.hash ? String(ref.hash) : null }))
    : []
  return {
    ...input,
    boundedLogs,
    evidenceRefs,
    sanitizedInput: input.sanitizedInput,
    previousAttempts: Number.isInteger(input.previousAttempts) && input.previousAttempts >= 0 ? input.previousAttempts : 0,
  }
}

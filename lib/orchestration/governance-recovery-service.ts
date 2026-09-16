import { createAdminClient } from '@/lib/supabase/admin'
import { executeGovernanceSpecialistAgent } from '@/lib/agents/governance-specialist-agent'
import {
  canMarkOriginalStepSucceeded,
  classifyGovernanceFailure,
  failureSignalFromCode,
  validateDebuggerInput,
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
  debuggerRunId?: string | null
}) {
  const canSucceed = canMarkOriginalStepSucceeded({
    debuggerOutcome: input.outcome,
    originalStepReexecuted: input.originalStepReexecuted,
    originalExitGatePassed: input.originalExitGatePassed,
  })
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').from('governance_recovery_events').update({
    debugger_outcome: input.outcome,
    debugger_run_id: input.debuggerRunId ?? null,
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

async function resolveRuntimeDebuggerDefinition() {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').from('agent_definitions')
    .select('id,agent_key,version,enabled')
    .eq('agent_key', 'support_agent')
    .eq('version', '1.0')
    .eq('enabled', true)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve governed runtime debugger: ${error.message}`)
  if (!data) throw new Error('Governed runtime debugger support agent is unavailable.')
  return String(data.id)
}

/**
 * Routes a failed orchestrator/supervisor result through the governed recovery
 * classifier. Runtime/system defects receive a bounded, read-only support-agent
 * diagnosis. The debugger is never allowed to mark the original step successful;
 * a later re-execution plus EXIT gate pass is still required.
 */
export async function handleGovernanceRuntimeFailure(input: {
  projectId: string
  actorUserId: string
  orchestratorRunId: string
  failingRunId?: string | null
  failingStepId?: string | null
  code?: string | null
  policyVersion: string
}) {
  const failingStepId = input.failingStepId?.trim() || 'orchestrator-runtime'
  const evidenceRefs = input.failingRunId ? [{ type: 'AGENT_RUN', id: input.failingRunId }] : []
  const recorded = await recordGovernanceFailureClassification({
    projectId: input.projectId,
    orchestratorRunId: input.orchestratorRunId,
    failingRunId: input.failingRunId ?? null,
    failingStepId,
    correlationId: input.orchestratorRunId,
    signal: failureSignalFromCode(input.code),
    evidenceRefs,
  })

  if (recorded.classification.disposition !== 'DEBUGGER_REQUIRED') {
    return { ...recorded, debuggerRunId: null, debuggerOutcome: null as RuntimeDebuggingOutcome | null }
  }

  const debuggerInput = buildBoundedDebuggerInput({
    failingRunId: input.failingRunId ?? input.orchestratorRunId,
    failingStepId,
    correlationId: input.orchestratorRunId,
    agentKey: 'native_supervisor_agent',
    toolKey: 'governance_specialist_investigate',
    errorCode: input.code ?? null,
    sanitizedInput: {
      orchestratorRunId: input.orchestratorRunId,
      failingRunId: input.failingRunId ?? null,
      failingStepId,
      errorCode: input.code ?? null,
    },
    boundedLogs: input.code ? [`Persisted runtime failure code: ${input.code}`] : [],
    previousAttempts: 0,
    dependencyStates: {},
    policySnapshotId: `governance-orchestrator:${input.policyVersion}`,
    evidenceRefs,
    lastKnownGoodCheckpoint: null,
  })
  const validationFailures = validateDebuggerInput(debuggerInput)
  if (validationFailures.length) throw new Error(`Runtime debugger input rejected: ${validationFailures.join(' ')}`)

  const debuggerDefinitionId = await resolveRuntimeDebuggerDefinition()
  const diagnosis = await executeGovernanceSpecialistAgent({
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    agentDefinitionId: debuggerDefinitionId,
    question: [
      'Diagnose the persisted DataNexus runtime/system failure using authoritative project evidence only.',
      `Failure code: ${input.code ?? 'UNKNOWN'}.`,
      `Failing step: ${failingStepId}.`,
      'This is a read-only debugging task. Do not mutate runtime, policy, source data, schemas, credentials, or governance truth.',
      'Separate observed evidence from hypotheses and recommendations. Any remediation remains separately governed.',
    ].join(' '),
  })

  const debuggerOutcome: RuntimeDebuggingOutcome = 'NOT_RECOVERABLE'
  await recordRuntimeDebuggerOutcome({
    recoveryEventId: recorded.recoveryEventId,
    outcome: debuggerOutcome,
    debuggerRunId: diagnosis.runId,
    originalStepReexecuted: false,
    originalExitGatePassed: false,
  })

  return {
    ...recorded,
    debuggerRunId: diagnosis.runId,
    debuggerOutcome,
  }
}

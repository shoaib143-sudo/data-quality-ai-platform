import { createAdminClient } from '@/lib/supabase/admin'

type SupervisorEvent = {
  event_type: string
  plan_hash: string
  step_id: string | null
  contract_hash: string | null
  input_hash: string | null
  output_hash: string | null
  attempt: number | null
  detail_code: string | null
}

function ratio(numerator: number, denominator: number, fallback = 1) {
  if (denominator <= 0) return fallback
  return Math.max(0, Math.min(1, numerator / denominator))
}

function rounded(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 10000) / 10000
}

function validHash(value: string | null) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value)
}

export async function evaluateNativeSupervisorTrajectory(supervisorRunId: string) {
  const admin = createAdminClient()
  const { data: run, error: runError } = await admin.schema('agent').from('agent_runs')
    .select('id,project_id,status,agent_definition_id')
    .eq('id', supervisorRunId)
    .maybeSingle()
  if (runError || !run) throw new Error(`Unable to resolve native supervisor run: ${runError?.message ?? 'not found'}`)

  const { data: definition, error: definitionError } = await admin.schema('agent').from('agent_definitions')
    .select('agent_key,version')
    .eq('id', run.agent_definition_id)
    .maybeSingle()
  if (definitionError || !definition || definition.agent_key !== 'native_supervisor_agent') {
    throw new Error('Trajectory evaluation is only available for native supervisor runs')
  }

  const [{ data: events, error: eventError }, { data: children, error: childrenError }] = await Promise.all([
    admin.schema('agent').from('agent_supervisor_events')
      .select('event_type,plan_hash,step_id,contract_hash,input_hash,output_hash,attempt,detail_code')
      .eq('agent_run_id', supervisorRunId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    admin.schema('agent').from('agent_runs')
      .select('id,status')
      .eq('parent_run_id', supervisorRunId),
  ])
  if (eventError) throw new Error(`Unable to load native supervisor trajectory: ${eventError.message}`)
  if (childrenError) throw new Error(`Unable to load native supervisor child runs: ${childrenError.message}`)

  const trajectory = (events ?? []) as SupervisorEvent[]
  if (!trajectory.length) throw new Error('Native supervisor trajectory has no persisted events')

  const planHashes = new Set(trajectory.map((event) => event.plan_hash))
  if (planHashes.size !== 1) throw new Error('Native supervisor trajectory contains multiple plan hashes')

  const stepIds = new Set(trajectory.map((event) => event.step_id).filter((value): value is string => Boolean(value)))
  const validatedStepIds = new Set(
    trajectory
      .filter((event) => event.event_type === 'STEP_VALIDATED' && event.step_id)
      .map((event) => event.step_id as string),
  )
  const failedStepIds = new Set(
    trajectory
      .filter((event) => event.event_type === 'STEP_FAILED' && event.step_id)
      .map((event) => event.step_id as string),
  )
  const recoveredStepIds = new Set(Array.from(failedStepIds).filter((stepId) => validatedStepIds.has(stepId)))
  const startedEvents = trajectory.filter((event) => event.event_type === 'STEP_STARTED')
  const approvalEvents = trajectory.filter((event) => event.event_type === 'APPROVAL_REQUIRED')
  const recoveryEvents = trajectory.filter((event) => event.event_type === 'RECOVERY_DECIDED')
  const expectedSteps = Math.max((children ?? []).length, stepIds.size)
  const extraAttempts = startedEvents.reduce((sum, event) => sum + Math.max(0, Number(event.attempt ?? 1) - 1), 0)

  const stepEvidenceEvents = trajectory.filter((event) =>
    ['STEP_STARTED', 'STEP_EXECUTED', 'STEP_VALIDATED', 'STEP_FAILED', 'RECOVERY_DECIDED', 'APPROVAL_REQUIRED'].includes(event.event_type),
  )
  const evidencedEvents = stepEvidenceEvents.filter((event) => {
    if (!event.step_id || !validHash(event.contract_hash) || !validHash(event.input_hash)) return false
    if (['STEP_EXECUTED', 'STEP_VALIDATED'].includes(event.event_type) && !validHash(event.output_hash)) return false
    return true
  }).length

  const planSucceeded = trajectory.some((event) => event.event_type === 'PLAN_SUCCEEDED')
  const planFailed = trajectory.some((event) => event.event_type === 'PLAN_FAILED')
  if (planSucceeded === planFailed) {
    throw new Error('Native supervisor trajectory must contain exactly one terminal plan outcome')
  }
  const completion = planSucceeded ? 1 : 0
  const coverage = ratio(validatedStepIds.size, expectedSteps, completion)
  const evidenceIntegrity = ratio(evidencedEvents, stepEvidenceEvents.length)
  const recoveryEffectiveness = failedStepIds.size
    ? ratio(recoveredStepIds.size, failedStepIds.size, 0)
    : 1
  const retryEfficiency = rounded(1 - ratio(extraAttempts, Math.max(expectedSteps * 2, 1), 0))

  const dimensions = {
    completion: rounded(completion),
    step_coverage: rounded(coverage),
    evidence_integrity: rounded(evidenceIntegrity),
    recovery_effectiveness: rounded(recoveryEffectiveness),
    retry_efficiency: rounded(retryEfficiency),
    expected_steps: expectedSteps,
    validated_steps: validatedStepIds.size,
    failed_steps: failedStepIds.size,
    recovered_steps: recoveredStepIds.size,
    total_attempts: startedEvents.length,
    extra_attempts: extraAttempts,
    recovery_decisions: recoveryEvents.length,
    approval_interrupts: approvalEvents.length,
    terminal_status: planSucceeded ? 'SUCCEEDED' : 'FAILED',
    plan_hash: Array.from(planHashes)[0],
  }

  const score = rounded(
    completion * 0.35
    + coverage * 0.25
    + evidenceIntegrity * 0.2
    + recoveryEffectiveness * 0.1
    + retryEfficiency * 0.1,
  )

  const { data: evaluation, error: evaluationError } = await admin.schema('agent').from('agent_evaluations').upsert({
    project_id: run.project_id,
    agent_run_id: run.id,
    evaluator_type: 'NATIVE_TRAJECTORY',
    evaluator_version: '1.0',
    score,
    dimensions,
    feedback: {
      authority: 'DETERMINISTIC_RUNTIME_EVIDENCE',
      model_judgment_used: false,
    },
  }, { onConflict: 'agent_run_id,evaluator_type,evaluator_version' })
    .select('id,score,dimensions,evaluator_type,evaluator_version,created_at')
    .single()

  if (evaluationError || !evaluation) {
    throw new Error(`Unable to persist native trajectory evaluation: ${evaluationError?.message ?? 'unknown error'}`)
  }
  return evaluation
}

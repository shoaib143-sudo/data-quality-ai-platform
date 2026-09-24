/**
 * User-facing instructions are derived from server-verified checkpoints.
 * Never advance on a click alone, on stale policy edits, or on a self-reported
 * run outcome. Missing evidence is an explicit blocking step.
 */
export type GuidedJourneyStep =
  | 'SELECT_PROJECT'
  | 'VERIFY_SOURCES'
  | 'SAVE_GUIDED_POLICY'
  | 'OBTAIN_EXECUTION_ACCESS'
  | 'ENTER_GOAL'
  | 'SUBMIT_RUN'
  | 'REVIEW_APPROVAL'
  | 'MONITOR_RUN'
  | 'REVIEW_FAILURE'
  | 'VERIFY_EVIDENCE'
  | 'REQUEST_CERTIFICATION'
  | 'COMPLETE'

export type GuidedJourneyInput = {
  projectId: string
  sourceSelected: boolean
  readinessLoaded: boolean
  readinessReady: boolean
  persistedMode: string
  persistedEnabled: boolean
  persistedEmergencyStop: boolean
  hasUnsavedPolicyEdits: boolean
  canExecute: boolean
  goal: string
  runMode?: string | null
  runStatus?: string | null
  runId?: string | null
  executedCount: number
  verifiedCount: number
  certificationEligible: boolean
  assessmentState?: string | null
}

export type GuidedJourneyInstruction = {
  step: GuidedJourneyStep
  stepNumber: number
  totalSteps: number
  heading: string
  instruction: string
  target: string
  isTerminal: boolean
}
const totalSteps = 7

export function nextGuidedInstruction(input: GuidedJourneyInput): GuidedJourneyInstruction {
  const result = (step: GuidedJourneyStep, stepNumber: number, heading: string, instruction: string, target: string, isTerminal = false) =>
    ({ step, stepNumber, totalSteps, heading, instruction, target, isTerminal })
  if (!input.projectId) {
    return result('SELECT_PROJECT', 1, 'Choose your project',
      'Select the project you are authorized to run. Confirm that it is the intended governance and data-source scope.', '#autonomy-project')
  }
  if (input.sourceSelected && (!input.readinessLoaded || !input.readinessReady)) {
    return result('VERIFY_SOURCES', 2, 'Verify source readiness',
      'Inspect every selected source table below. Open Discovery and Data Catalog to resolve missing registration, AVAILABLE versions, or execution bindings; then refresh this preflight. A selected scope alone is not proof of profiling readiness.', '#guided-source-preflight')
  }
  if (input.persistedMode !== 'GUIDED' || !input.persistedEnabled || input.persistedEmergencyStop || input.hasUnsavedPolicyEdits) {
    return result('SAVE_GUIDED_POLICY', 3, 'Activate GUIDED with an administrator',
      'Select GUIDED, review the LOW-risk policy and emergency stop, and explicitly save it. If the emergency stop is active, only an authorized administrator may clear it for this test. Unsaved selections do not authorize execution.', '#autonomy-mode')
  }
  if (!input.canExecute) {
    return result('OBTAIN_EXECUTION_ACCESS', 4, 'Obtain execution permission',
      'Ask a project administrator for agent.execute permission. The walkthrough cannot execute a run using another person’s authority.', '#guided-execution-goal')
  }
  if (!input.goal.trim()) {
    return result('ENTER_GOAL', 4, 'Specify the exact execution goal',
      'Describe the governed E2E objective. Keep a copy of this exact text: it is bound to the approval fingerprint and must be confirmed by the reviewer.', '#guided-execution-goal')
  }
  const hasCurrentRun = Boolean(input.runId) && input.runMode === 'GUIDED'
  if (!hasCurrentRun) {
    return result('SUBMIT_RUN', 4, 'Submit the GUIDED run',
      'Review the goal and any explicitly selected source, then choose Run DataNexus Governance Orchestrator. Submission requests approval; it is not proof of successful execution.', '#guided-run-action')
  }
  if (input.runStatus === 'WAITING_APPROVAL') {
    return result('REVIEW_APPROVAL', 5, 'Review the human approval',
      'Open the approval inbox below. An authorized reviewer must inspect the exact goal, risk, policy snapshot and fingerprint, add a reason and decide. If business and governance approval are both required, both must be recorded. No approval can be fabricated.', '#guided-approvals')
  }
  if (input.runStatus === 'RUNNING') {
    return result('MONITOR_RUN', 6, 'Monitor the real execution',
      'The supervisor is running. Open Job Monitor and refresh this page to inspect live state; do not mark capabilities as executed or verified without persisted evidence.', '#guided-runtime')
  }
  if (['FAILED', 'BLOCKED_POLICY', 'BLOCKED_EXTERNAL', 'CANCELLED'].includes(input.runStatus ?? '')) {
    return result('REVIEW_FAILURE', 6, 'Execution is blocked',
      'Inspect the reported failure, use Job Monitor or Recovery for evidence, and resolve the cause before submitting a new user-initiated run. The walkthrough does not silently retry or claim success.', '#guided-runtime')
  }
  if (input.runStatus !== 'SUCCEEDED' || input.executedCount < 75 || input.verifiedCount < 75 || !input.certificationEligible) {
    return result('VERIFY_EVIDENCE', 6, 'Verify the persisted evidence',
      'Inspect the 75-capability ledger. The run cannot be certified unless all 75 were executed and independently verified, with complete canonical evidence and no unresolved blockers.', '#guided-capability-coverage')
  }
  if (input.assessmentState !== 'PASS') {
    return result('REQUEST_CERTIFICATION', 7, 'Request independent certification',
      'A user with certification.review must select Independent certification. Only the independent server-side assessment can complete the GUIDED test.', '#guided-certification-action')
  }
  return result('COMPLETE', 7, 'GUIDED E2E independently certified',
    'The exact GUIDED run has a persisted independent PASS assessment. Review its evidence before moving to GOVERNED_AUTO.', '#guided-capability-coverage', true)
}

/**
 * Evidence-based, mode-specific operator walkthrough for the two autonomous
 * governance modes. Unlike a wizard, phases advance only on persisted policy
 * and run checkpoints; no user click marks a phase complete.
 *
 * Scope note: this is a UI operator guide, NOT a change to autonomous
 * dispatch/scope behavior or a substitute for server-side authorization.
 */
export type AutonomousWalkthroughMode = 'GOVERNED_AUTO' | 'FULL_AUTONOMOUS'

export type AutonomousJourneyStep =
  | 'SELECT_PROJECT'
  | 'SAVE_POLICY'
  | 'OBTAIN_EXECUTION_ACCESS'
  | 'ENTER_GOAL'
  | 'SUBMIT_RUN'
  | 'REVIEW_APPROVAL'
  | 'MONITOR_RUN'
  | 'REVIEW_FAILURE'
  | 'VERIFY_EVIDENCE'
  | 'REQUEST_CERTIFICATION'
  | 'COMPLETE'

export type AutonomousJourneyInput = {
  mode: AutonomousWalkthroughMode
  projectId: string
  persistedMode: string
  persistedEnabled: boolean
  persistedEmergencyStop: boolean
  hasUnsavedPolicyEdits: boolean
  canExecute: boolean
  goal: string
  runId?: string | null
  runMode?: string | null
  runStatus?: string | null
  executedCount: number
  verifiedCount: number
  certificationEligible: boolean
  assessmentState?: string | null
}

export type AutonomousJourneyInstruction = {
  step: AutonomousJourneyStep
  stepNumber: number
  totalSteps: number
  heading: string
  instruction: string
  target: string
  isTerminal: boolean
}

const TOTAL_STEPS = 7

/**
 * A completed run from a different autonomy mode cannot advance this journey.
 * Execution success alone also cannot confer 75/75 coverage or certification.
 */
export function nextAutonomousInstruction(input: AutonomousJourneyInput): AutonomousJourneyInstruction {
  const label = input.mode === 'GOVERNED_AUTO' ? 'GOVERNED_AUTO' : 'FULL_AUTONOMOUS'
  const result = (step: AutonomousJourneyStep, stepNumber: number,
    heading: string, instruction: string, target: string, isTerminal = false): AutonomousJourneyInstruction =>
    ({ step, stepNumber, totalSteps: TOTAL_STEPS, heading, instruction, target, isTerminal })

  if (!input.projectId) {
    return result('SELECT_PROJECT', 1, 'Choose an authorized project',
      'Select the project for this governance objective and verify your access. No project is chosen implicitly by this walkthrough.', '#autonomy-project')
  }
  if (input.persistedMode !== input.mode || !input.persistedEnabled ||
      input.persistedEmergencyStop || input.hasUnsavedPolicyEdits) {
    return result('SAVE_POLICY', 2, 'Review and save the ' + label + ' policy',
      'Review risk, action/tool allowances, execution/model budgets and emergency stop. An authorized administrator must deliberately save an enabled policy for this mode. Clearing an active stop or raising a budget requires explicit authorization; unsaved changes cannot launch a run.',
      '#autonomy-mode')
  }
  if (!input.canExecute) {
    return result('OBTAIN_EXECUTION_ACCESS', 3, 'Obtain project execution authority',
      'Request agent.execute access from a project administrator. The walkthrough cannot borrow another person’s credentials or grant access.', '#guided-execution-goal')
  }
  if (!input.goal.trim()) {
    return result('ENTER_GOAL', 3, 'Specify the governance objective',
      'Enter the exact measurable objective and review the intended project and data scope. These autonomous modes currently use project-level dataset attachment when datasets exist; do not assume GUIDED source isolation applies.', '#guided-execution-goal')
  }
  const hasCurrentRun = Boolean(input.runId) && input.runMode === input.mode
  if (!hasCurrentRun) {
    const oversight = input.mode === 'GOVERNED_AUTO'
      ? 'Review permitted low-risk automatic actions and escalation thresholds.'
      : 'Review autonomous tool, model, risk, budget and approval boundaries.'
    return result('SUBMIT_RUN', 4, 'Submit the ' + label + ' objective',
      oversight + ' Confirm the current backend project-wide dataset attachment behavior before starting. Submission does not prove that a plan ran or was approved.', '#guided-run-action')
  }
  if (input.runStatus === 'WAITING_APPROVAL') {
    return result('REVIEW_APPROVAL', 5, 'Human decision required',
      'A governed action has paused for approval. An authorized independent reviewer must inspect the exact request and record a genuine decision. The operator may monitor or stop the run, but cannot fabricate approval.', '#guided-approvals')
  }
  if (input.runStatus === 'RUNNING' || input.runStatus === 'QUEUED') {
    return result('MONITOR_RUN', 5, 'Monitor autonomous execution',
      'Inspect the persisted supervisor status and Job Monitor. Check agent activity, budget and policy boundaries, exceptions and any required human intervention. An active or queued run is not a completed checkpoint.', '#guided-runtime')
  }
  if (['FAILED', 'BLOCKED_POLICY', 'BLOCKED_EXTERNAL', 'CANCELLED'].includes(input.runStatus ?? '')) {
    return result('REVIEW_FAILURE', 5, 'Investigate the blocked or failed run',
      'Review the exact server-reported failure and audit trail in Job Monitor or Recovery. Do not treat a cancelled, policy-blocked or failed run as success, and do not silently retry.', '#guided-runtime')
  }
  if (input.runStatus !== 'SUCCEEDED') {
    return result('MONITOR_RUN', 5, 'Inspect the current run status',
      'Refresh persisted run state. An unknown or incomplete status cannot advance to evidence verification.', '#guided-runtime')
  }
  if (input.executedCount !== 75 || input.verifiedCount !== 75 || !input.certificationEligible) {
    return result('VERIFY_EVIDENCE', 6, 'Inspect canonical run evidence',
      'Examine the persisted capability ledger and failures. Full canonical E2E PASS requires exactly 75 executed and 75 independently verified capabilities with no unresolved blockers; a narrower successful objective is not a full E2E PASS.', '#guided-capability-coverage')
  }
  if (input.assessmentState !== 'PASS') {
    return result('REQUEST_CERTIFICATION', 7, 'Request independent certification',
      'An independent certification.review reviewer must assess this exact run and its canonical evidence. A supervisor success response cannot grant independent PASS.', '#guided-certification-action')
  }
  return result('COMPLETE', 7, label + ' E2E independently certified',
    'The exact run has persisted independent PASS and complete canonical evidence. This walkthrough does not authorize raising budgets, enabling new actions or starting another run.', '#guided-capability-coverage', true)
}

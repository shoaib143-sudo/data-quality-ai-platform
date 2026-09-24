import assert from 'node:assert/strict'
import test from 'node:test'
import { nextAutonomousInstruction } from '../lib/orchestration/governance-autonomous-journey.ts'

const modes = ['GOVERNED_AUTO', 'FULL_AUTONOMOUS']
const base = mode => ({
  mode,
  projectId: 'authorized-project',
  persistedMode: mode,
  persistedEnabled: true,
  persistedEmergencyStop: false,
  hasUnsavedPolicyEdits: false,
  canExecute: true,
  goal: 'Examine governance audit readiness with recorded evidence',
  runId: null,
  runMode: null,
  runStatus: null,
  executedCount: 0,
  verifiedCount: 0,
  certificationEligible: false,
  assessmentState: null,
})

for (const mode of modes) {
  test(mode + ': user must select project, save exact mode policy and have execution access', () => {
    const input = base(mode)
    assert.equal(nextAutonomousInstruction({ ...input, projectId: '' }).step, 'SELECT_PROJECT')
    assert.equal(nextAutonomousInstruction({ ...input, persistedMode: 'GUIDED' }).step, 'SAVE_POLICY')
    assert.equal(nextAutonomousInstruction({ ...input, persistedEnabled: false }).step, 'SAVE_POLICY')
    assert.equal(nextAutonomousInstruction({ ...input, persistedEmergencyStop: true }).step, 'SAVE_POLICY')
    assert.equal(nextAutonomousInstruction({ ...input, hasUnsavedPolicyEdits: true }).step, 'SAVE_POLICY')
    assert.equal(nextAutonomousInstruction({ ...input, canExecute: false }).step, 'OBTAIN_EXECUTION_ACCESS')
    assert.equal(nextAutonomousInstruction({ ...input, goal: '\n \t' }).step, 'ENTER_GOAL')
    const ready = nextAutonomousInstruction(input)
    assert.equal(ready.step, 'SUBMIT_RUN')
    assert.equal(ready.stepNumber, 4)
    assert.match(ready.instruction, /project-wide dataset attachment/)
  })

  test(mode + ': actual pending approval and running statuses retain human oversight', () => {
    const input = { ...base(mode), runId: 'persisted-run', runMode: mode }
    const pending = nextAutonomousInstruction({ ...input, runStatus: 'WAITING_APPROVAL' })
    assert.equal(pending.step, 'REVIEW_APPROVAL')
    assert.equal(pending.stepNumber, 5)
    assert.equal(pending.target, '#guided-approvals')
    for (const status of ['RUNNING', 'QUEUED', 'UNKNOWN', null]) {
      assert.equal(nextAutonomousInstruction({ ...input, runStatus: status }).step, 'MONITOR_RUN')
    }
    assert.equal(nextAutonomousInstruction({ ...input, runStatus: 'RUNNING',
      assessmentState: 'PASS', executedCount: 75, verifiedCount: 75, certificationEligible: true }).step, 'MONITOR_RUN')
  })

  test(mode + ': negative/failure cases are blocking and never auto-advance', () => {
    const input = { ...base(mode), runId: 'persisted-run', runMode: mode }
    for (const status of ['FAILED', 'BLOCKED_POLICY', 'BLOCKED_EXTERNAL', 'CANCELLED']) {
      assert.equal(nextAutonomousInstruction({ ...input, runStatus: status,
        executedCount: 75, verifiedCount: 75, certificationEligible: true, assessmentState: 'PASS' }).step, 'REVIEW_FAILURE')
    }
  })

  test(mode + ': only canonical 75/75 evidence can request independent certification', () => {
    const input = { ...base(mode), runId: 'persisted-run', runMode: mode, runStatus: 'SUCCEEDED' }
    assert.equal(nextAutonomousInstruction(input).step, 'VERIFY_EVIDENCE')
    assert.equal(nextAutonomousInstruction({ ...input,
      executedCount: 75, verifiedCount: 74, certificationEligible: true, assessmentState: 'PASS' }).step, 'VERIFY_EVIDENCE')
    assert.equal(nextAutonomousInstruction({ ...input,
      executedCount: 74, verifiedCount: 75, certificationEligible: true, assessmentState: 'PASS' }).step, 'VERIFY_EVIDENCE')
    assert.equal(nextAutonomousInstruction({ ...input,
      executedCount: 75, verifiedCount: 75, certificationEligible: false, assessmentState: 'PASS' }).step, 'VERIFY_EVIDENCE')
    assert.equal(nextAutonomousInstruction({ ...input,
      executedCount: 76, verifiedCount: 75, certificationEligible: true, assessmentState: 'PASS' }).step, 'VERIFY_EVIDENCE')
    assert.equal(nextAutonomousInstruction({ ...input,
      executedCount: Number.NaN, verifiedCount: 75, certificationEligible: true, assessmentState: 'PASS' }).step, 'VERIFY_EVIDENCE')
    const ready = { ...input, executedCount: 75, verifiedCount: 75, certificationEligible: true }
    assert.equal(nextAutonomousInstruction(ready).step, 'REQUEST_CERTIFICATION')
    assert.equal(nextAutonomousInstruction(ready).stepNumber, 7)
    const done = nextAutonomousInstruction({ ...ready, assessmentState: 'PASS' })
    assert.equal(done.step, 'COMPLETE')
    assert.equal(done.isTerminal, true)
  })

  test(mode + ': cannot carry old approval, coverage or certification from another mode or missing run', () => {
    const input = { ...base(mode), runId: 'old-run', runMode: mode === 'GOVERNED_AUTO' ? 'FULL_AUTONOMOUS' : 'GOVERNED_AUTO',
      runStatus: 'SUCCEEDED', executedCount: 75, verifiedCount: 75, certificationEligible: true, assessmentState: 'PASS' }
    assert.equal(nextAutonomousInstruction(input).step, 'SUBMIT_RUN')
    assert.equal(nextAutonomousInstruction({ ...input, runMode: mode, runId: null }).step, 'SUBMIT_RUN')
  })
}

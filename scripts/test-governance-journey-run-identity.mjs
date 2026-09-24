import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesGovernanceRunIdentity } from '../lib/orchestration/governance-journey-run-identity.ts'

const current = {
  projectId: 'project-1',
  mode: 'GOVERNED_AUTO',
  policyVersion: 'v42',
  goalHash: 'f'.repeat(64),
  hasUnsavedPolicyEdits: false,
  run: {
    id: 'run-1',
    project_id: 'project-1',
    mode: 'GOVERNED_AUTO',
    policy_version: 'v42',
    goal_hash: 'f'.repeat(64),
    status: 'SUCCEEDED',
  },
}

test('only the exact persisted run identity may drive autonomous progress', () => {
  assert.equal(matchesGovernanceRunIdentity(current), true)
  assert.equal(matchesGovernanceRunIdentity({ ...current, mode: 'FULL_AUTONOMOUS' }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, projectId: 'project-2' }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, policyVersion: 'v43' }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, goalHash: 'a'.repeat(64) }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, hasUnsavedPolicyEdits: true }), false)
})

test('missing, malformed and tampered persisted identity cannot unlock prior evidence', () => {
  assert.equal(matchesGovernanceRunIdentity({ ...current, run: null }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, run: { ...current.run, id: null } }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, run: { ...current.run, project_id: 'other' } }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, run: { ...current.run, mode: 'GUIDED' } }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, run: { ...current.run, policy_version: 'stale' } }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, run: { ...current.run, goal_hash: 'tampered' } }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, policyVersion: null }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, goalHash: null }), false)
})

test('same-goal reruns are rejected if the saved policy or project changes', () => {
  const previous = { ...current.run, status: 'WAITING_APPROVAL' }
  assert.equal(matchesGovernanceRunIdentity({ ...current, run: previous }), true)
  assert.equal(matchesGovernanceRunIdentity({ ...current, policyVersion: 'v43', run: previous }), false)
  assert.equal(matchesGovernanceRunIdentity({ ...current, projectId: 'project-2', run: previous }), false)
})

const guidedBase = {
  projectId: 'project-1',
  mode: 'GUIDED',
  policyVersion: 'guided-v9',
  goalHash: '9'.repeat(64),
  hasUnsavedPolicyEdits: false,
}

test('GUIDED explicit source evidence is bound to the exact immutable scope version', () => {
  const run = {
    id: 'guided-run',
    project_id: 'project-1',
    mode: 'GUIDED',
    policy_version: 'guided-v9',
    goal_hash: '9'.repeat(64),
    decision_trace: {
      guided_scope_mode: 'EXPLICIT',
      guided_scope: { scope_version_id: 'scope-v4' },
    },
  }
  assert.equal(matchesGovernanceRunIdentity({
    ...guidedBase, guidedScope: { selected: true, scopeVersionId: 'scope-v4' }, run,
  }), true)
  assert.equal(matchesGovernanceRunIdentity({
    ...guidedBase, guidedScope: { selected: true, scopeVersionId: 'scope-v5' }, run,
  }), false)
  assert.equal(matchesGovernanceRunIdentity({
    ...guidedBase, guidedScope: { selected: true, scopeVersionId: null }, run,
  }), false)
  assert.equal(matchesGovernanceRunIdentity({
    ...guidedBase, guidedScope: { selected: false }, run,
  }), false)
})

test('GUIDED governance-only run requires explicit NONE scope marker and no contradictory snapshot', () => {
  const cleanNone = {
    id: 'guided-none',
    project_id: 'project-1',
    mode: 'GUIDED',
    policy_version: 'guided-v9',
    goal_hash: '9'.repeat(64),
    decision_trace: { guided_scope_mode: 'NONE' },
  }
  assert.equal(matchesGovernanceRunIdentity({
    ...guidedBase, guidedScope: { selected: false }, run: cleanNone,
  }), true)
  assert.equal(matchesGovernanceRunIdentity({
    ...guidedBase, guidedScope: { selected: false },
    run: { ...cleanNone, decision_trace: { guided_scope_mode: 'NONE', guided_scope: {} } },
  }), false)
  assert.equal(matchesGovernanceRunIdentity({
    ...guidedBase, guidedScope: { selected: false },
    run: { ...cleanNone, decision_trace: {} },
  }), false)
  assert.equal(matchesGovernanceRunIdentity({
    ...guidedBase, run: cleanNone,
  }), false)
})

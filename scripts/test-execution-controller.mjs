import assert from 'node:assert/strict'
import { GovernedExecutionController, ExecutionControlDeniedError } from '../lib/ai/execution-controller.ts'

const projectId = 'project-1'
const agentDefinitionId = 'agent-1'

function row(overrides = {}) {
  return {
    id: 'control-1',
    project_id: projectId,
    scope_type: 'PROJECT',
    scope_key: 'PROJECT',
    effective_state: 'PAUSE',
    control_action: 'PAUSE',
    reason: 'maintenance',
    actor_user_id: 'user-1',
    actor_capability: 'admin.manage',
    correlation_id: null,
    created_at: '2026-09-09T00:00:00.000Z',
    ...overrides,
  }
}

function controller(rows) {
  return new GovernedExecutionController({
    async listEffectiveControls(requestProjectId) {
      assert.equal(requestProjectId, projectId)
      return rows
    },
  })
}

assert.deepEqual(
  await controller([]).evaluate({ projectId, agentDefinitionId }),
  { allowed: true, decision: 'ALLOW_NO_CONTROL', blockingControls: [], applicableControls: [] },
)

const projectKill = row({ effective_state: 'KILL', control_action: 'KILL' })
assert.equal((await controller([projectKill]).evaluate({ projectId, agentDefinitionId })).decision, 'DENY_KILLED')

const projectPause = row()
const agentResume = row({ id: 'control-2', scope_type: 'AGENT', scope_key: agentDefinitionId, effective_state: 'RUNNING', control_action: 'RESUME' })
assert.equal((await controller([projectPause, agentResume]).evaluate({ projectId, agentDefinitionId })).decision, 'DENY_PAUSED')

const agentKill = row({ scope_type: 'AGENT', scope_key: agentDefinitionId, effective_state: 'KILL', control_action: 'KILL' })
assert.equal((await controller([agentKill]).evaluate({ projectId, agentDefinitionId })).decision, 'DENY_KILLED')

const otherAgentKill = row({ scope_type: 'AGENT', scope_key: 'agent-2', effective_state: 'KILL', control_action: 'KILL' })
assert.equal((await controller([otherAgentKill]).evaluate({ projectId, agentDefinitionId })).decision, 'ALLOW_NO_CONTROL')

const crossProjectKill = row({ project_id: 'project-2', effective_state: 'KILL', control_action: 'KILL' })
assert.equal((await controller([crossProjectKill]).evaluate({ projectId, agentDefinitionId })).decision, 'ALLOW_NO_CONTROL')

const projectResume = row({ effective_state: 'RUNNING', control_action: 'RESUME' })
assert.equal((await controller([projectResume]).evaluate({ projectId, agentDefinitionId })).decision, 'ALLOW_RESUMED')

const projectIdScopedPause = row({ scope_key: projectId })
assert.equal((await controller([projectIdScopedPause]).evaluate({ projectId, agentDefinitionId })).decision, 'DENY_PAUSED')

const aiSystemKill = row({ scope_type: 'AI_SYSTEM', scope_key: 'system-1', effective_state: 'KILL', control_action: 'KILL' })
assert.equal((await controller([aiSystemKill]).evaluate({ projectId, agentDefinitionId })).decision, 'ALLOW_NO_CONTROL')

await assert.rejects(
  () => controller([agentKill]).assertAllowed({ projectId, agentDefinitionId }),
  (error) => {
    assert.ok(error instanceof ExecutionControlDeniedError)
    assert.equal(error.code, 'AI_EXECUTION_CONTROL_BLOCKED')
    assert.equal(error.decision, 'DENY_KILLED')
    assert.deepEqual(error.scopes, [{ scopeType: 'AGENT', scopeKey: agentDefinitionId, state: 'KILL' }])
    assert.equal('reason' in error.scopes[0], false)
    return true
  },
)

await assert.rejects(() => controller([]).evaluate({ projectId: '   ', agentDefinitionId }), /projectId is required/)

console.log('ADR-006 governed emergency execution controller behavior verified.')

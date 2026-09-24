/**
 * Fail-closed binding for an operator walkthrough. A latest run may belong
 * to an older objective, a previous policy version, another autonomy mode,
 * another project, or (for GUIDED) a different selected source-scope version.
 * Never apply its checkpoints unless the persisted identity agrees exactly.
 */
export type GuidedRunScopeIdentity = {
  selected: boolean
  scopeVersionId?: string | null
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function matchesGovernanceRunIdentity(input: {
  projectId: string
  mode: string
  policyVersion: string | null | undefined
  goalHash: string | null | undefined
  hasUnsavedPolicyEdits: boolean
  guidedScope?: GuidedRunScopeIdentity
  run: Record<string, unknown> | null
}): boolean {
  const run = input.run
  const baseMatches = Boolean(input.projectId && input.mode && input.policyVersion && input.goalHash
    && !input.hasUnsavedPolicyEdits
    && run
    && (typeof run.orchestratorRunId === 'string' || typeof run.id === 'string')
    && run.project_id === input.projectId
    && run.mode === input.mode
    && run.policy_version === input.policyVersion
    && run.goal_hash === input.goalHash)
  if (!baseMatches || !run) return false
  if (input.mode !== 'GUIDED') return true

  // GUIDED must always carry the immutable scope marker written by the server.
  // Missing/malformed legacy traces fail closed rather than inheriting evidence.
  if (!input.guidedScope) return false
  const trace = safeObject(run.decision_trace)
  if (input.guidedScope.selected) {
    if (!input.guidedScope.scopeVersionId || trace.guided_scope_mode !== 'EXPLICIT') return false
    const snapshot = safeObject(trace.guided_scope)
    return snapshot.scope_version_id === input.guidedScope.scopeVersionId
  }
  return trace.guided_scope_mode === 'NONE'
    && !Object.prototype.hasOwnProperty.call(trace, 'guided_scope')
}

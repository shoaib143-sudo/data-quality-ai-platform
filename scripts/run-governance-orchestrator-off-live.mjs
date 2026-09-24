import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { createAdminClient } from '@/lib/supabase/admin'
import { runGovernanceOrchestrator } from '@/lib/orchestration/governance-orchestrator-service-v2'

const PROJECT_ID = process.env.GOVERNANCE_E2E_PROJECT_ID?.trim() || ''
const PRIMARY_PROJECT_ID = process.env.GOVERNANCE_E2E_PRIMARY_PROJECT_ID?.trim() || ''
const EVIDENCE_PATH = process.env.GOVERNANCE_E2E_EVIDENCE_PATH?.trim() || ''
const GOAL = 'Run governed end-to-end Data Governance and AI assurance for this project.'

if (!PROJECT_ID) throw new Error('GOVERNANCE_E2E_PROJECT_ID is required.')
if (!PRIMARY_PROJECT_ID || PROJECT_ID === PRIMARY_PROJECT_ID) {
  throw new Error('OFF baseline requires an isolated fixture distinct from the primary Handsfree E2E project.')
}

const admin = createAdminClient()

async function resolveAuthorizedActor() {
  const { data: project, error: projectError } = await admin
    .schema('app')
    .from('projects')
    .select('organization_id')
    .eq('id', PROJECT_ID)
    .maybeSingle()
  if (projectError || !project?.organization_id) {
    throw new Error('Unable to resolve the E2E project organization.')
  }

  const { data: members, error: membersError } = await admin
    .schema('app')
    .from('organization_members')
    .select('user_id,role,created_at')
    .eq('organization_id', project.organization_id)
    .order('created_at')
    .limit(50)
  if (membersError) throw new Error('Unable to resolve organization members for the E2E actor.')

  for (const member of members ?? []) {
    const { data: canExecute, error } = await admin
      .schema('governance')
      .rpc('has_project_capability', {
        p_project_id: PROJECT_ID,
        p_user_id: member.user_id,
        p_capability: 'agent.execute',
      })
    if (!error && canExecute === true) return String(member.user_id)
  }

  throw new Error('No authorized agent.execute actor is available for the E2E project.')
}

const actorUserId = await resolveAuthorizedActor()

const { data: policy, error: policyError } = await admin
  .schema('governance')
  .from('orchestrator_autonomy_policies')
  .select('mode,enabled,policy_version,maximum_risk_tier,emergency_stop')
  .eq('project_id', PROJECT_ID)
  .maybeSingle()
if (policyError || !policy) throw new Error('The explicit E2E autonomy policy is missing.')
if (policy.mode !== 'OFF' || policy.enabled !== false) {
  throw new Error('OFF baseline runner refuses to execute unless the project policy is explicitly OFF and disabled.')
}
if (policy.emergency_stop === true) throw new Error('OFF baseline policy must not rely on emergency_stop.')

const startedAt = new Date().toISOString()
const result = await runGovernanceOrchestrator({
  projectId: PROJECT_ID,
  actorUserId,
  goal: GOAL,
})

if (result.status !== 'BLOCKED_POLICY') {
  throw new Error(`OFF baseline expected BLOCKED_POLICY, received ${result.status}.`)
}
if (result.policy.mode !== 'OFF' || result.policy.enabled !== false) {
  throw new Error('OFF baseline returned an unexpected policy state.')
}
if (result.decision.allowed !== false || result.decision.requiresApproval !== false) {
  throw new Error('OFF baseline policy decision was not fail-closed.')
}
if (result.decision.reason !== 'Autonomy is disabled.') {
  throw new Error(`OFF baseline returned unexpected policy reason: ${result.decision.reason}`)
}

const { data: persisted, error: persistedError } = await admin
  .schema('governance')
  .from('governance_orchestrator_runs')
  .select('id,project_id,actor_user_id,policy_version,mode,status,supervisor_run_id,ai_capability_e2e_run_id,decision_trace,created_at')
  .eq('id', result.orchestratorRunId)
  .eq('project_id', PROJECT_ID)
  .maybeSingle()
if (persistedError || !persisted) throw new Error('OFF baseline orchestrator evidence was not persisted.')
if (persisted.mode !== 'OFF' || persisted.status !== 'BLOCKED_POLICY') {
  throw new Error('Persisted OFF baseline does not reflect BLOCKED_POLICY.')
}
if (persisted.supervisor_run_id !== null) {
  throw new Error('OFF baseline unexpectedly created a supervisor run.')
}
if (persisted.ai_capability_e2e_run_id !== null) {
  throw new Error('OFF baseline unexpectedly created a canonical capability run.')
}
if (persisted.actor_user_id !== actorUserId) {
  throw new Error('Persisted OFF baseline actor does not match the authorized execution actor.')
}

const evidence = {
  status: 'PASS',
  projectId: PROJECT_ID,
  mode: persisted.mode,
  runStatus: persisted.status,
  policyVersion: persisted.policy_version,
  policyDecision: {
    allowed: result.decision.allowed,
    requiresApproval: result.decision.requiresApproval,
    reason: result.decision.reason,
  },
  orchestratorRunId: persisted.id,
  supervisorRunCreated: persisted.supervisor_run_id !== null,
  capabilityRunCreated: persisted.ai_capability_e2e_run_id !== null,
  actorAuthorizationVerified: true,
  trigger: 'github_protected_main_e2e',
  startedAt,
  completedAt: new Date().toISOString(),
}

if (EVIDENCE_PATH) {
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true })
  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
}

console.log(JSON.stringify(evidence, null, 2))

import fs from 'node:fs'

function replaceOnce(path, before, after) {
  const current = fs.readFileSync(path, 'utf8')
  if (current.includes(after)) return false
  if (!current.includes(before)) throw new Error(`Patch marker not found in ${path}: ${before.slice(0, 120)}`)
  fs.writeFileSync(path, current.replace(before, after))
  return true
}

const autonomyPath = 'lib/governance/governed-autonomy.ts'
replaceOnce(
  autonomyPath,
  "import { createGovernancePolicyDecisionProvider } from '@/lib/governance/governance-policy-decision-provider'\n",
  "import { createGovernancePolicyDecisionProvider } from '@/lib/governance/governance-policy-decision-provider'\nimport { executeGovernedReprofileAction } from '@/lib/governance/governed-reprofile-action'\nimport { invalidateGovernedActionOutcome } from '@/lib/governance/governed-action-outcomes'\n",
)
replaceOnce(
  autonomyPath,
  "    if (claimed.action_key !== 'CREATE_GOVERNANCE_ISSUE') {\n      throw new Error(`Autonomous execution is not implemented for ${claimed.action_key}; explicit governed execution remains required.`)\n    }\n    const executed = await executeCreateGovernanceIssue(claimed)",
  "    const executed = claimed.action_key === 'CREATE_GOVERNANCE_ISSUE'\n      ? await executeCreateGovernanceIssue(claimed)\n      : claimed.action_key === 'REQUEST_REPROFILE'\n        ? await executeGovernedReprofileAction(claimed)\n        : (() => { throw new Error(`Autonomous execution is not implemented for ${claimed.action_key}; explicit governed execution remains required.`) })()",
)
replaceOnce(
  autonomyPath,
  "        reversible: true,",
  "        reversible: claimed.action_key === 'CREATE_GOVERNANCE_ISSUE',\n        outcome_verification_required: true,",
)
replaceOnce(
  autonomyPath,
  "  if (actionUpdateError || !rolledBack) throw new Error(`Unable to persist autonomy rollback: ${actionUpdateError?.message ?? 'unknown error'}`)\n\n  await writeGovernanceAudit({",
  "  if (actionUpdateError || !rolledBack) throw new Error(`Unable to persist autonomy rollback: ${actionUpdateError?.message ?? 'unknown error'}`)\n\n  await invalidateGovernedActionOutcome({\n    projectId: action.project_id,\n    actionId: action.id,\n    actorUserId,\n    reason: `Governed action ${action.id} was rolled back using ${policyRaw.rollback_strategy}.`,\n  })\n\n  await writeGovernanceAudit({",
)
replaceOnce(
  autonomyPath,
  "  const [policies, actions] = await Promise.all([\n    admin.schema('governance').from('autonomy_policies').select('*').eq('project_id', projectId).order('action_key'),\n    admin.schema('governance').from('autonomy_actions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100),\n  ])\n  if (policies.error) throw new Error(`Unable to list autonomy policies: ${policies.error.message}`)\n  if (actions.error) throw new Error(`Unable to list autonomy actions: ${actions.error.message}`)\n  return { policies: policies.data ?? [], actions: actions.data ?? [] }",
  "  const [policies, actions, outcomes] = await Promise.all([\n    admin.schema('governance').from('autonomy_policies').select('*').eq('project_id', projectId).order('action_key'),\n    admin.schema('governance').from('autonomy_actions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100),\n    admin.schema('governance').from('autonomy_action_outcomes').select('*').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(100),\n  ])\n  if (policies.error) throw new Error(`Unable to list autonomy policies: ${policies.error.message}`)\n  if (actions.error) throw new Error(`Unable to list autonomy actions: ${actions.error.message}`)\n  if (outcomes.error) throw new Error(`Unable to list autonomy action outcomes: ${outcomes.error.message}`)\n  return { policies: policies.data ?? [], actions: actions.data ?? [], outcomes: outcomes.data ?? [] }",
)

const routePath = 'app/api/governance/autonomy/route.ts'
replaceOnce(
  routePath,
  "import { requireUser } from '@/lib/auth/require-user'",
  "import { requireApiUser } from '@/lib/auth/require-api-user'",
)
replaceOnce(
  routePath,
  "import { executeApprovedAutonomyAction } from '@/lib/governance/approved-autonomy-execution'\n",
  "import { executeApprovedAutonomyAction } from '@/lib/governance/approved-autonomy-execution'\nimport { verifyGovernedActionOutcome } from '@/lib/governance/governed-action-outcomes'\n",
)
let route = fs.readFileSync(routePath, 'utf8')
if (route.includes('requireUser()')) {
  route = route.replaceAll('requireUser()', 'requireApiUser()')
  fs.writeFileSync(routePath, route)
}
replaceOnce(
  routePath,
  "      if (operation === 'ROLLBACK') {",
  "      if (operation === 'VERIFY_OUTCOME') {\n        const actionId = text(body?.actionId ?? body?.action_id)\n        if (!actionId) return NextResponse.json({ error: 'actionId is required.' }, { status: 400 })\n        if (!(await requireActionInProject(actionId, projectId))) return NextResponse.json({ error: 'Autonomy action was not found in this project.' }, { status: 404 })\n        const verification = await verifyGovernedActionOutcome({ projectId, actionId, actorUserId: user.id })\n        return NextResponse.json({ accepted: true, verification })\n      }\n\n      if (operation === 'ROLLBACK') {",
)

const autonomy = fs.readFileSync(autonomyPath, 'utf8')
const patchedRoute = fs.readFileSync(routePath, 'utf8')
for (const required of [
  'executeGovernedReprofileAction',
  'invalidateGovernedActionOutcome',
  "claimed.action_key === 'REQUEST_REPROFILE'",
  'outcome_verification_required: true',
  "from('autonomy_action_outcomes')",
]) {
  if (!autonomy.includes(required)) throw new Error(`V5 autonomy integration incomplete: ${required}`)
}
for (const required of ['requireApiUser', 'verifyGovernedActionOutcome', "operation === 'VERIFY_OUTCOME'"]) {
  if (!patchedRoute.includes(required)) throw new Error(`V5 autonomy route integration incomplete: ${required}`)
}
if (patchedRoute.includes('requireUser()')) throw new Error('V5 autonomy route still contains redirecting requireUser auth.')
console.log('V5 governed action integration patch applied.')

import fs from 'node:fs'

const path = 'lib/governance/governed-autonomy.ts'
let source = fs.readFileSync(path, 'utf8')

const importMarker = "import { createGovernancePolicyDecisionProvider } from '@/lib/governance/governance-policy-decision-provider'\n"
const importReplacement = `${importMarker}import { assertGovernedActionReferencesInProject } from '@/lib/governance/governed-action-scope'\n`
if (!source.includes("from '@/lib/governance/governed-action-scope'")) {
  if (!source.includes(importMarker)) throw new Error('V5 import marker missing')
  source = source.replace(importMarker, importReplacement)
}

const proposalMarker = `  const riskLevel = normalizeRisk(input.riskLevel)\n  const confidence = clamp(input.confidence)\n  const policy = await loadPolicy(input.projectId, actionKey)\n`
const proposalReplacement = `  const riskLevel = normalizeRisk(input.riskLevel)\n  const confidence = clamp(input.confidence)\n  await assertGovernedActionReferencesInProject({\n    projectId: input.projectId,\n    targetType,\n    targetId: input.targetId ?? null,\n    sourceAgentRunId: input.sourceAgentRunId ?? null,\n  })\n  const policy = await loadPolicy(input.projectId, actionKey)\n`
if (!source.includes('await assertGovernedActionReferencesInProject({')) {
  if (!source.includes(proposalMarker)) throw new Error('V5 proposal marker missing')
  source = source.replace(proposalMarker, proposalReplacement)
}

const listMarker = `  const [policies, actions] = await Promise.all([\n    admin.schema('governance').from('autonomy_policies').select('*').eq('project_id', projectId).order('action_key'),\n    admin.schema('governance').from('autonomy_actions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100),\n  ])\n  if (policies.error) throw new Error(\`Unable to list autonomy policies: \${policies.error.message}\`)\n  if (actions.error) throw new Error(\`Unable to list autonomy actions: \${actions.error.message}\`)\n  return { policies: policies.data ?? [], actions: actions.data ?? [] }\n`
const listReplacement = `  const [policies, actions, outcomes] = await Promise.all([\n    admin.schema('governance').from('autonomy_policies').select('*').eq('project_id', projectId).order('action_key'),\n    admin.schema('governance').from('autonomy_actions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100),\n    admin.schema('governance').from('governed_action_outcomes').select('*').eq('project_id', projectId).order('recorded_at', { ascending: false }).limit(100),\n  ])\n  if (policies.error) throw new Error(\`Unable to list autonomy policies: \${policies.error.message}\`)\n  if (actions.error) throw new Error(\`Unable to list autonomy actions: \${actions.error.message}\`)\n  if (outcomes.error) throw new Error(\`Unable to list governed action outcomes: \${outcomes.error.message}\`)\n  return { policies: policies.data ?? [], actions: actions.data ?? [], outcomes: outcomes.data ?? [] }\n`
if (!source.includes("from('governed_action_outcomes')")) {
  if (!source.includes(listMarker)) throw new Error('V5 list marker missing')
  source = source.replace(listMarker, listReplacement)
}

fs.writeFileSync(path, source)
console.log('V5 operational autonomy patch applied')

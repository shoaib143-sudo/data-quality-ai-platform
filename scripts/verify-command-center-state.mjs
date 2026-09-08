import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing Command Center artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}
function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing Command Center contract: ${pattern}`)
  }
}

requireText('lib/ai/command-center-state.ts', [
  'GovernedCommandCenterState',
  'AI_SYSTEM_NOT_APPROVED',
  'AUTO_POLICY_ENABLED',
  'AUTO_POLICY_NOT_REVIEWED',
  'AUTO_POLICY_NOT_REVERSIBLE',
  'AUTO_POLICY_HIGH_RISK',
  'autonomyExpansionAllowed: false',
  'directMutationEnabled: false',
  'emergencyKillMutationEnabled: false',
  'policyMutationEnabled: false',
])
requireText('lib/ai/governance-command-center-state.ts', [
  "from('ai_systems')",
  "from('autonomy_policies')",
  "from('autonomy_actions')",
  'project_id',
])
requireText('app/admin/ai-command-center/page.tsx', [
  'DataNexus AI Command Center',
  'authorizeProject',
  "'admin.manage'",
  'createGovernanceCommandCenterState',
  'Mutation controls remain closed',
  'form method="get"',
  'Autonomy policies',
  'Recent autonomy actions',
])
requireText('app/admin/page.tsx', ["href=\"/admin/ai-command-center\""])

const adapter = read('lib/ai/governance-command-center-state.ts')
for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']) {
  if (adapter.includes(forbidden)) throw new Error(`Command Center projection must remain read-only: found ${forbidden}`)
}

const page = read('app/admin/ai-command-center/page.tsx')
for (const forbidden of ['method="post"', "'use server'", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']) {
  if (page.includes(forbidden)) throw new Error(`Command Center page must remain read-only: found ${forbidden}`)
}

console.log('ADR-006 Command Center read-only control-state and UI boundary verified.')

import fs from 'node:fs'

const failures = []
const requireTokens = (path, tokens) => {
  if (!fs.existsSync(path)) {
    failures.push(`${path}: missing file`)
    return ''
  }
  const source = fs.readFileSync(path, 'utf8')
  for (const token of tokens) if (!source.includes(token)) failures.push(`${path}: missing ${token}`)
  return source
}

const layout = requireTokens('app/admin/ai-command-center/layout.tsx', [
  '/admin/ai-command-center',
  '/admin/ai-command-center/explorer',
  '/admin/ai-command-center/resource-controls',
  '/admin/ai-command-center/audit',
])

const page = requireTokens('app/admin/ai-command-center/explorer/page.tsx', [
  "authorizeProject(user.id, selectedProjectId, 'admin.manage')",
  'createGovernanceCommandCenterState().read(selectedProjectId)',
  'CommandCenterExplorer items={items}',
  "source: 'governance.ai_systems'",
  "source: 'governance.ai_evaluation_results'",
  "source: 'governance.ai_telemetry_events'",
  "source: 'governance.data_quality_investigations'",
  "source: 'governance.ai_routing_policy_versions'",
  "source: 'governance.autonomy_actions'",
  'read-only',
])

const client = requireTokens('app/admin/ai-command-center/explorer/command-center-explorer.tsx', [
  "'use client'",
  'useMemo',
  'useState',
  'filterCommandCenterExplorerItems',
  '<details',
  'Read-only canonical evidence projection',
])

requireTokens('lib/ai/command-center-explorer.ts', [
  'filterCommandCenterExplorerItems',
  'commandCenterExplorerCounts',
  "sort?: 'NEWEST' | 'OLDEST' | 'TITLE'",
  "category?: CommandCenterExplorerCategory | 'ALL'",
])

for (const [path, source] of [
  ['app/admin/ai-command-center/layout.tsx', layout],
  ['app/admin/ai-command-center/explorer/page.tsx', page],
  ['app/admin/ai-command-center/explorer/command-center-explorer.tsx', client],
]) {
  for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(', 'fetch(', 'method: \'POST\'', 'method: "POST"']) {
    if (source.includes(forbidden)) failures.push(`${path}: interactive Command Center must remain read-only; found ${forbidden}`)
  }
}

if (page.includes('createAdminClient')) failures.push('Explorer page must not introduce a new service-role read path; reuse the authorized canonical Command Center state adapter.')
if (!page.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')")) failures.push('Explorer must require admin.manage before loading canonical evidence.')

if (failures.length) {
  console.error('Command Center Explorer verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('ADR-006 Command Center Explorer read-only authorization and canonical-evidence boundaries verified.')

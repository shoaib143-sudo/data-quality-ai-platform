import fs from 'node:fs'

const routes = fs.readFileSync('lib/platform/canonical-routes.ts', 'utf8')
const agentsPage = fs.readFileSync('app/agents/page.tsx', 'utf8')
const agentDetail = fs.readFileSync('app/agents/[agentKey]/[version]/page.tsx', 'utf8')
const runDetail = fs.readFileSync('app/agents/runs/[runId]/page.tsx', 'utf8')

const checks = [
  ['canonical route builder exists', routes.includes('export function canonicalResourcePath')],
  ['canonical route segments are encoded', routes.includes('encodeURIComponent(normalized)')],
  ['blank identities fail closed', routes.includes("throw new Error('Canonical route segments must be non-empty.')")],
  ['malformed base paths fail closed', routes.includes("throw new Error('Canonical route base paths must start with /.')")],
  ['versioned agent route is canonical', routes.includes("canonicalResourcePath('/agents', agentKey, version)")],
  ['immutable agent run route is canonical', routes.includes("canonicalResourcePath('/agents/runs', runId)")],
  ['agent list consumes canonical route builder', agentsPage.includes('canonicalRoutes.agent(agent.agent_key, agent.version)')],
  ['agent run links consume canonical route builder', agentsPage.includes('canonicalRoutes.agentRun(run.id)') && agentDetail.includes('canonicalRoutes.agentRun(run.id)')],
  ['agent identity is resolved exactly', agentDetail.includes(".eq('agent_key', agentKey)") && agentDetail.includes(".eq('version', version)")],
  ['missing agent identity fails closed', agentDetail.includes('if (!agentRow) notFound()')],
  ['agent detail is read-only', !/\.(insert|update|delete|upsert)\s*\(/.test(agentDetail)],
  ['agent run route resolves immutable run id', runDetail.includes(".eq('id', runId)")],
  ['agent list has no inline dynamic agent href', !agentsPage.includes('/agents/${encodeURIComponent(agent.agent_key)')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)

if (failures.length) {
  console.error(`Navigation integrity verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}

console.log('PASS platform navigation integrity contract')

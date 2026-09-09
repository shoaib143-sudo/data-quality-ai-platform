import fs from 'node:fs'

const listPage = fs.readFileSync('app/agents/page.tsx', 'utf8')
const detailPage = fs.readFileSync('app/agents/[agentKey]/[version]/page.tsx', 'utf8')

const checks = [
  ['agent list links to versioned detail route', listPage.includes('/agents/${encodeURIComponent(agent.agent_key)}/${encodeURIComponent(agent.version)}')],
  ['detail route is authenticated', detailPage.includes('await requireUser()')],
  ['detail lookup pins agent key', detailPage.includes(".eq('agent_key', agentKey)")],
  ['detail lookup pins version', detailPage.includes(".eq('version', version)")],
  ['missing definitions return notFound', detailPage.includes('if (!agentRow) notFound()')],
  ['tools are scoped to exact agent definition', detailPage.includes(".eq('agent_definition_id', agent.id)")],
  ['runs are scoped to exact agent definition', detailPage.match(/\.eq\('agent_definition_id', agent\.id\)/g)?.length === 2],
  ['detail page remains read-only', !/\.(insert|update|delete|upsert)\s*\(/.test(detailPage)],
  ['detail page exposes registry metadata', detailPage.includes('{agent.name} v{agent.version}') && detailPage.includes('{agent.agent_key}')],
  ['detail page exposes registered tools', detailPage.includes('Registered tools')],
  ['detail page exposes recent runs', detailPage.includes('Recent runs')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)

if (failures.length) {
  console.error(`Agent detail route verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}

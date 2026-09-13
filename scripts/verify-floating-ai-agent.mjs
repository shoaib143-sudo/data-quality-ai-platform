import fs from 'node:fs'

const layout = fs.readFileSync('app/layout.tsx','utf8')
const floating = fs.readFileSync('components/ai/floating-datanexus-agent.tsx','utf8')
const api = fs.readFileSync('app/api/ai/copilot/chat/route.ts','utf8')
const landing = fs.readFileSync('components/governance/role-landing-page.tsx','utf8')

const checks = [
  ['single global AI Agent mount', layout.includes('<FloatingDataNexusAgent />')],
  ['floating icon is on left and fixed', floating.includes('fixed bottom-5 left-4') && floating.includes('fixed bottom-20 left-4')],
  ['overlay does not consume layout width', floating.includes('fixed bottom-20 left-4 z-[119]')],
  ['compact and expanded states exist', floating.includes('setExpanded') && floating.includes('Compact AI Agent') && floating.includes('Expand AI Agent')],
  ['chat stays in-page', !floating.includes('window.location') && !floating.includes('href="/ai-insights"')],
  ['old sidebar AI Agent is removed', !landing.includes('DataNexus AI Agent')],
  ['API resolves persona server-side', api.includes('resolveLandingAccess(user.id)') && api.includes('personas[access.persona]')],
  ['API requires authenticated user', api.includes('requireApiUser()')],
  ['API uses governed intelligent router', api.includes('createGovernanceIntelligentRouter()') && api.includes("task: 'governance_reasoning'") && api.includes('decision.provider.generateJson')],
  ['AI truth boundary is explicit', api.includes('Never invent counts') && api.includes('Do not claim governance approval')],
  ['AI context is limited by authenticated RLS queries', api.includes('createClient()') && api.includes("schema('catalog')") && api.includes("schema('governance')") && api.includes("schema('app')")],
  ['partial evidence failure degrades instead of fabricating', api.includes('evidenceAvailability') && api.includes("'UNAVAILABLE'")],
  ['AI model routing preserves governed composition boundary', !api.includes('getReasoningProvider') && api.includes('createGovernanceIntelligentRouter') && api.includes('executionCorrelationId')],
  ['persona bootstrap exists before first chat turn', api.includes('export async function GET()') && floating.includes("fetch('/api/ai/copilot/chat'")],
]

const failures=checks.filter(([,ok])=>!ok)
for(const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`)
if(failures.length) process.exit(1)
console.log('PASS floating DataNexus AI Agent contract')

import assert from 'node:assert/strict'
import fs from 'node:fs'
const source=fs.readFileSync('app/agents/page.tsx','utf8')
for(const marker of ['Governed automation','AI Agents','Enabled agents','Registered tools','Active recent runs','Failed / stopped','Review learning cases','Open Job Monitor','Recent agent runs']) assert.ok(source.includes(marker), `agents UX marker missing: ${marker}`)
assert.ok(source.includes("bg-[#050b17]"), 'agents must use the native DataNexus dark canvas')
assert.ok(source.includes('filterAuthorizedExecutionRuns'), 'recent runs must remain authorization filtered')
assert.ok(source.includes('canViewDatasetResource'), 'dataset options must remain resource authorized')
assert.ok(source.includes("hasProjectCapability(user.id, project.id, 'agent.execute')"), 'agent execution must remain project capability scoped')
assert.ok(source.includes('resolveConversationPolicy'), 'conversation defaults must remain governed')
console.log('AI Agents UX experience contract passed.')

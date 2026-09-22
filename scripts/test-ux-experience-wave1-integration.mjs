import assert from 'node:assert/strict'
import fs from 'node:fs'

const files={
  search:fs.readFileSync('app/search/global-search.tsx','utf8'),
  journey:fs.readFileSync('app/journeys/page.tsx','utf8'),
  copilot:fs.readFileSync('app/api/ai/copilot/chat/route.ts','utf8'),
  agent:fs.readFileSync('components/ai/floating-datanexus-agent.tsx','utf8'),
  dataset:fs.readFileSync('app/catalog/dataset/[datasetId]/page.tsx','utf8'),
  trust:fs.readFileSync('components/governance/dataset-trust-signals.tsx','utf8'),
  notFound:fs.readFileSync('app/not-found.tsx','utf8'),
  loading:fs.readFileSync('components/app-shell/workspace-state.tsx','utf8'),
  telemetry:fs.readFileSync('app/api/ux/interaction/route.ts','utf8'),
}

assert.ok(files.search.includes('Governed result'),'search results must expose governed-result context')
assert.ok(files.search.includes('No governed match yet'),'search must expose a truthful zero-result state')
assert.ok(files.journey.includes('Next best action'),'guided journey must expose the deterministic next action')
assert.ok(files.journey.includes('first lifecycle stage without sufficient governed evidence'),'next action rationale must remain evidence-derived')
assert.ok(files.copilot.includes('workspaceForPath'),'copilot must derive current workspace deterministically')
assert.ok(files.copilot.includes('currentWorkspace: workspace'),'copilot reasoning input must include current workspace')
assert.ok(files.agent.includes('Ask about this governed workspace.'),'agent UI must communicate workspace context')
assert.ok(files.dataset.includes('<DatasetTrustSignals'),'Dataset 360 must surface trust signals')
assert.ok(files.trust.includes('No AI-generated trust state'),'trust strip must preserve the governance truth boundary')
assert.ok(files.notFound.includes('No data was changed.'),'not-found recovery must preserve mutation-safety messaging')
assert.ok(files.notFound.includes('Search DataNexus'),'not-found recovery must provide search')
assert.ok(files.loading.includes('aria-busy="true"'),'shared loading state must expose busy semantics')
assert.ok(files.loading.includes('motion-reduce:animate-none'),'loading feedback must respect reduced motion')
assert.ok(files.telemetry.includes("authorizeProject(user.id,projectId,'catalog.read')"),'interaction telemetry must authorize project access')
assert.ok(files.telemetry.includes("aggregate_type:'ux_interaction'"),'interaction telemetry must use the bounded UX aggregate')
console.log('DataNexus UX Experience Wave 1 integration contract passed.')

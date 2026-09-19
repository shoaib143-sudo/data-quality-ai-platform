import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/jobs/worker/route.ts', import.meta.url), 'utf8')
const service = fs.readFileSync(new URL('../lib/orchestration/worker-service.ts', import.meta.url), 'utf8')

test('Next worker route is a thin provider adapter around the portable worker service', () => {
  assert.match(route, /runScheduledWorkerCycle/)
  assert.match(route, /runAdaptiveWorkerCycle/)
  assert.match(route, /processClaimedDurableJob/)
  for (const implementation of [
    'dispatchAdaptiveRounds',
    'runProjectionWorker',
    'cleanupExpiredObjectArtifacts',
    'refreshAllPredictiveRisk',
    'refreshAllAIGovernanceIntelligence',
    'applyAllPredictiveRiskGovernedActions',
    'processSemanticIndexJobs',
    'processGovernanceAgentJobs',
    'processDurableJobs',
  ]) {
    assert.doesNotMatch(route, new RegExp(implementation))
    assert.match(service, new RegExp(implementation))
  }
})

test('portable worker service has no Next.js request or response dependency', () => {
  assert.doesNotMatch(service, /next\/server|NextRequest|NextResponse/)
  assert.match(service, /export async function runScheduledWorkerCycle/)
  assert.match(service, /export async function runAdaptiveWorkerCycle/)
  assert.match(service, /export async function processClaimedDurableJob/)
})

test('existing worker authorization remains at the ingress adapter', () => {
  assert.match(route, /isAuthorizedWorkerBearer/)
  assert.match(route, /process\.env\.CRON_SECRET/)
  assert.match(route, /Worker access denied/)
})

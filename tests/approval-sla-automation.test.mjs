import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/internal/governance/approval-automation/route.ts', import.meta.url), 'utf8')
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

test('approval automation is authenticated and bounded', () => {
  assert.match(route, /requireInternalBearer\(request\)/)
  assert.match(route, /status: 401/)
  assert.match(route, /evaluateAgentApprovalSlaEscalations\(100\)/)
  assert.match(route, /processApprovalNotificationOutbox\(25\)/)
  assert.match(route, /'Cache-Control': 'no-store'/)
})

test('approval automation does not auto-approve or execute requests', () => {
  assert.doesNotMatch(route, /recordAgentApprovalDecision|validateApprovalForExecution|finalizeAgentApprovalExecution/)
  assert.doesNotMatch(route, /READY_TO_EXECUTE|EXECUTED/)
})

test('Vercel invokes the governed approval automation daily', () => {
  const cron = (vercel.crons ?? []).find(item => item.path === '/api/internal/governance/approval-automation')
  assert.ok(cron)
  assert.equal(cron.schedule, '15 0 * * *')
})

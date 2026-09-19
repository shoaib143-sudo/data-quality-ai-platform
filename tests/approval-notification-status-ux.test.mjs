import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync(new URL('../lib/governance/approval-inbox.ts', import.meta.url), 'utf8')
const ui = fs.readFileSync(new URL('../app/approvals/approval-inbox.tsx', import.meta.url), 'utf8')

test('approval inbox exposes delivery metadata without recipient identity or provider body', () => {
  assert.match(service, /agent_approval_notification_outbox/)
  assert.match(service, /channel,event_type,status,attempt_count,last_attempt_at,next_attempt_at,sent_at,dead_lettered_at/)
  assert.doesNotMatch(service, /recipient_user_id.*approvalNotificationClientView/s)
  assert.doesNotMatch(service, /last_error.*approvalNotificationClientView/s)
})

test('approval notification UX keeps DataNexus authoritative and surfaces dead letters', () => {
  assert.match(ui, /DataNexus remains authoritative/)
  assert.match(ui, /DEAD_LETTER/)
  assert.match(ui, /Delivery exhausted/)
  assert.match(ui, /Next retry/)
  assert.match(ui, /DATANEXUS.*EMAIL.*TEAMS/s)
})

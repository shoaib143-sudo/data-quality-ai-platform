import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolveMonitorRoute } from '../lib/monitoring/monitor-route.ts'

assert.equal(resolveMonitorRoute({ runId: 'run 1', monitorUrl: '/monitoring?run=run%201' }), '/monitoring?run=run%201')
assert.equal(resolveMonitorRoute({ runId: 'abc', monitorUrl: null }), '/monitoring?run=abc')
assert.equal(resolveMonitorRoute({ runId: 'abc', monitorUrl: 'https://evil.example/run' }), '/monitoring?run=abc')
assert.equal(resolveMonitorRoute({ runId: 'abc', monitorUrl: '//evil.example/monitoring' }), '/monitoring?run=abc')
assert.equal(resolveMonitorRoute({ runId: null, monitorUrl: 'javascript:alert(1)' }), '/monitoring')
assert.equal(resolveMonitorRoute({ runId: null, monitorUrl: '/monitoring' }), '/monitoring')

const inbox = fs.readFileSync('app/approvals/approval-inbox.tsx', 'utf8')
assert.ok(inbox.includes("import { resolveMonitorRoute } from '@/lib/monitoring/monitor-route'"), 'approval execution must use the safe monitor resolver')
assert.ok(inbox.includes('router.push(resolveMonitorRoute({'), 'approval execution must validate returned monitor routes')
assert.ok(!inbox.includes('router.push(payload.monitorUrl ??'), 'approval execution must never trust a raw monitor URL')
assert.ok(inbox.includes('disabled={busy === `${requestId}:EXECUTE`}'), 'execute CTA must suppress duplicate execution')
assert.ok(inbox.includes('A reason/comment is required for every approval or rejection.'), 'approval decisions must fail closed without comments')

console.log('Approval execution monitor-route unit and negative tests passed.')

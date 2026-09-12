import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const route = await readFile(new URL('../app/api/jobs/worker/route.ts', import.meta.url), 'utf8')
const lane = await readFile(new URL('../lib/orchestration/outbox-lane.ts', import.meta.url), 'utf8')
const outbox = await readFile(new URL('../lib/orchestration/outbox.ts', import.meta.url), 'utf8')

assert.match(route, /eventLaneBlocked \? skippedOutboxLane\(\) : await executeOutboxLane\(eventWorkerId\)/, 'adaptive convergence must stop re-hitting the outbox after transport degradation')
assert.match(route, /eventLaneBlocked = true/, 'transport degradation must fence further outbox attempts in the same request')
assert.match(route, /eventLaneDegraded: convergence\.eventLaneDegraded/, 'adaptive responses must expose degraded event-lane state')
assert.match(route, /eventLaneDisposition: eventLane\.disposition/, 'scheduled responses must expose event-lane disposition')
assert.match(route, /Worker access denied\./, 'worker bearer authorization must remain fail closed')
assert.match(route, /status: 403/, 'unauthorized worker calls must remain forbidden')
assert.match(route, /status: 500/, 'unhandled durable-worker failures must retain the fail-closed envelope')

assert.match(lane, /CLAIM_FAILED_RETRY_LATER/, 'claim transport failures need an explicit retry disposition')
assert.match(lane, /PROCESSING_FAILED_RETRY_BY_OUTBOX_POLICY/, 'processing transport failures need an explicit governed retry disposition')
assert.match(lane, /slice\(0, 500\)/, 'transport diagnostics must stay bounded')
assert.doesNotMatch(lane, /status:\s*['"]DONE['"]/, 'the isolation layer must never fabricate authoritative event completion')
assert.doesNotMatch(lane, /status:\s*['"]DEAD['"]/, 'the isolation layer must never fabricate authoritative event death')

assert.match(outbox, /if \(error\) throw new Error\(`Unable to claim governance events:/, 'authoritative outbox claim errors must still surface to the isolation boundary')
assert.match(outbox, /if \(updateError\) throw new Error\(`Unable to persist governance event failure:/, 'authoritative failure-state persistence errors must still surface')
assert.match(outbox, /await markDone\(event\.id\)/, 'event completion remains owned by the authoritative outbox processor')
assert.match(outbox, /await markFailed\(event, error\)/, 'event retry/dead state remains owned by the authoritative outbox processor')

console.log('Outbox transport-degradation contract verified without weakening governance authority.')

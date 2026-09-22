import assert from 'node:assert/strict'
import fs from 'node:fs'

const route=fs.readFileSync('app/api/ux/interaction/route.ts','utf8')
const client=fs.readFileSync('components/app-shell/ux-interaction-telemetry.ts','utf8')
for(const token of ['UX_TASK_STARTED','UX_TASK_COMPLETED','UX_SEARCH_ZERO_RESULTS','UX_ERROR_RECOVERED','UX_AI_ASSISTANCE_REQUESTED'])assert.ok(route.includes(token),`missing bounded UX event ${token}`)
assert.ok(route.includes("authorizeProject(user.id,projectId,'catalog.read')"),'UX telemetry must authorize project access')
assert.ok(route.includes("aggregate_type:'ux_interaction'"),'UX telemetry must use bounded aggregate type')
assert.ok(!/payload:\s*body/.test(route),'UX telemetry must not persist arbitrary request payloads')
assert.ok(client.includes('must never block governed work'),'client telemetry must remain non-blocking')
console.log('UX interaction telemetry v2 contract passed.')

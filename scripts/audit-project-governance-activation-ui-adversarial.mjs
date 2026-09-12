import assert from 'node:assert/strict'
import fs from 'node:fs'

const api=fs.readFileSync('app/api/platform/[projectId]/route.ts','utf8')
const ui=fs.readFileSync('app/platform/platform-controls-v2.tsx','utf8')

assert.doesNotMatch(api,/verify_project_governance_activation[\s\S]{0,300}(insert|update|delete|upsert)\(/i)
assert.doesNotMatch(ui,/PROJECT_GOVERNANCE_ACTIVATED[^\n]*(button|onClick|request\()/i)
assert.match(ui,/never counted as effective governance/)
assert.match(ui,/governanceBlockerLabel\(code\)/)
assert.match(ui,/pendingLabel\(key\)/)
assert.doesNotMatch(ui,/proposed_stewardship[^\n]*Stewardship" value/)
assert.doesNotMatch(ui,/provisional_certifications[^\n]*Active certifications" value/)

console.log('Independent adversarial governance activation UI audit passed.')

import assert from 'node:assert/strict'
import fs from 'node:fs'

const api=fs.readFileSync('app/api/platform/[projectId]/route.ts','utf8')
const ui=fs.readFileSync('app/platform/platform-controls-v2.tsx','utf8')

assert.match(api,/verify_project_governance_activation/)
assert.match(api,/governanceActivation:governanceActivation\.data\?\?null/)
assert.match(api,/authorizeProject\(user\.id,projectId,'catalog\.read'\)/)

assert.match(ui,/Effective project governance coverage/)
assert.match(ui,/Proposed, suggested, draft, and provisional records are shown separately and never counted as effective governance/)
assert.match(ui,/Authoritative classification/)
assert.match(ui,/Approved glossary/)
assert.match(ui,/Approved CDE/)
assert.match(ui,/Active contracts/)
assert.match(ui,/Active certifications/)
assert.match(ui,/Pending, non-effective records/)
assert.match(ui,/A governance activation requirement is not yet satisfied/)

console.log('Project governance activation UI contract passed.')

import assert from 'node:assert/strict'
import fs from 'node:fs'
const source=fs.readFileSync('app/inbox/page.tsx','utf8')
for(const marker of ['Governance Inbox','Current attention load','Pending workflows','Open issues','High alerts','Failed jobs','Approvals and workflows','Remediation work','Risk signals','Execution attention','Search evidence']) assert.ok(source.includes(marker), `inbox UX marker missing: ${marker}`)
assert.ok(source.includes("bg-[#050b17]"), 'inbox must use native DataNexus canvas')
assert.ok(source.includes("canAccessWorkspace(landing.persona,'workflows'"), 'workflow evidence must remain workspace gated')
assert.ok(source.includes("canAccessWorkspace(landing.persona,'issues'"), 'issues evidence must remain workspace gated')
assert.ok(source.includes("canAccessWorkspace(landing.persona,'observability'"), 'observability evidence must remain workspace gated')
assert.ok(source.includes("canAccessWorkspace(landing.persona,'monitoring'"), 'monitoring evidence must remain workspace gated')
assert.ok(source.includes('No synthetic notifications are created.'), 'inbox must preserve persisted-evidence truth boundary')
console.log('Governance Inbox UX experience contract passed.')

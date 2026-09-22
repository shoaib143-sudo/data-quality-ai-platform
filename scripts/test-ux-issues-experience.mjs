import assert from 'node:assert/strict'
import fs from 'node:fs'
const source=fs.readFileSync('app/issues/page.tsx','utf8')
for(const marker of ['Visible issues','High priority','Manageable projects','Governed truth','Canonical incident journey','Trace issue → evidence → impact → remediation → verification','IssueManager']) assert.ok(source.includes(marker), `issues UX marker missing: ${marker}`)
assert.ok(source.includes("hasProjectCapability(user.id, String(project.id), 'issues.manage')"), 'issue management authority must remain project capability scoped')
assert.ok(source.includes("canAccessWorkspace(landing.persona, 'data-quality'"), 'Data Quality transition must remain persona gated')
assert.ok(source.includes("canAccessWorkspace(landing.persona, 'profiling'"), 'profiling transition must remain persona gated')
assert.ok(source.includes('canProfiling && presentation.showProfilingEvidence ? <Link href="/profiling/explorer"'), 'profiling findings link must remain fail closed')
assert.ok(source.includes('canDataQuality ? <Link href="/data-quality"'), 'Data Quality link must remain fail closed')
console.log('Issues and Remediation UX experience contract passed.')

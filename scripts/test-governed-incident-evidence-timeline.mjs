import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/issues/[issueId]/page.tsx', 'utf8')
const view = fs.readFileSync('lib/governance/governed-incident-view.ts', 'utf8')

assert.ok(page.includes('Remediation evidence timeline'), 'governed incident must expose a remediation evidence timeline')
assert.ok(page.includes('Missing history is not inferred.'), 'timeline must disclose that absent history is never synthesized')
assert.ok(page.includes('item.observedAt&&Number.isFinite(Date.parse(String(item.observedAt)))'), 'timeline must reject malformed evidence timestamps')
assert.ok(page.includes(".sort((left,right)=>new Date(String(left.observedAt)).getTime()-new Date(String(right.observedAt)).getTime())"), 'timeline must be chronological')
assert.ok(page.includes('No timestamped governed evidence is linked. DataNexus will not manufacture a remediation history.'), 'timeline empty state must remain fail closed')
assert.ok(page.includes('aria-labelledby="incident-evidence-timeline"'), 'timeline must expose an accessible section label')
assert.ok(page.includes('<time className='), 'timeline timestamps must use semantic time elements')
assert.ok(view.includes('dueAt: truth.dueAt ?? null'), 'due-date truth must participate in the governed incident fingerprint')

console.log('Governed incident evidence timeline and truth-fingerprint contract passed.')

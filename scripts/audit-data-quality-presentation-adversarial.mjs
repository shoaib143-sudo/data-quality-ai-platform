import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../app/data-quality/page.tsx', import.meta.url), 'utf8')

const presenterIndex = source.indexOf('function presentRecommendation(value: unknown)')
const renderIndex = source.indexOf('const presented=presentRecommendation(recommendation)')
assert.ok(presenterIndex >= 0 && renderIndex > presenterIndex, 'Recommendation rendering must use the governed presentation helper.')
assert.match(source, /record\.approval_required === true/, 'Approval-required truth must fail closed to false only when the governed evidence is not explicitly true.')
assert.match(source, /typeof record\.rationale === 'string'/, 'Rationale must be type-checked before presentation.')
assert.match(source, /typeof record\.priority === 'string'/, 'Priority must be type-checked before presentation.')
assert.doesNotMatch(source, /finding_ids[^\n]*<|finding_ids[^\n]*\{/, 'Internal finding identifiers must not become visible recommendation fields.')
assert.doesNotMatch(source, /JSON\.stringify\(recommendation\)/, 'Raw backend recommendation payloads must not leak into the UI.')
assert.match(source, /formatScore\(typeof value==='number'\?value:null\)/, 'Unknown/non-numeric score states must render through the missing-score contract.')

console.log('data quality presentation adversarial audit: PASS', {
  rawPayloadLeakage: false,
  approvalBoundaryPreserved: true,
  unknownScorePresentation: 'N/A',
})

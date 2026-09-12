import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../app/data-quality/page.tsx', import.meta.url), 'utf8')

assert.match(source, /function formatScore\(value: number \| null \| undefined\).*'N\/A'/s, 'Missing scores must have an explicit N/A presentation.')
assert.doesNotMatch(source, /String\(value\)/, 'Score cards must not stringify null/undefined values.')
assert.match(source, /formatScore\(typeof value==='number'\?value:null\)/, 'Data quality dimension cards must use the score formatter.')
assert.doesNotMatch(source, /JSON\.stringify\(recommendation\)/, 'Recommendation objects must not be exposed as raw JSON.')
assert.match(source, /function presentRecommendation\(value: unknown\)/, 'Recommendations must cross an explicit presentation boundary.')
assert.match(source, /approvalRequired: record\.approval_required === true/, 'Approval-required truth must be preserved from governed recommendation evidence.')
assert.match(source, /APPROVAL REQUIRED/, 'Approval-required recommendations must communicate the boundary visibly.')
assert.doesNotMatch(source, /finding_ids.*presented/s, 'Internal finding identifier arrays must not be rendered as recommendation copy.')

console.log('data quality presentation contract: PASS')

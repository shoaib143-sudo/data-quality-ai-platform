import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../app/data-quality/page.tsx', import.meta.url), 'utf8')
const runButtonSource = await readFile(new URL('../app/data-quality/quality-run-button.tsx', import.meta.url), 'utf8')
const runRouteSource = await readFile(new URL('../app/api/data-quality/run/route.ts', import.meta.url), 'utf8')

const presenterIndex = source.indexOf('function presentRecommendation(value: unknown)')
const renderIndex = source.indexOf('const presented=presentRecommendation(recommendation)')
assert.ok(presenterIndex >= 0 && renderIndex > presenterIndex, 'Recommendation rendering must use the governed presentation helper.')
assert.match(source, /record\.approval_required === true/, 'Approval-required truth must fail closed to false only when the governed evidence is not explicitly true.')
assert.match(source, /typeof record\.rationale === 'string'/, 'Rationale must be type-checked before presentation.')
assert.match(source, /typeof record\.priority === 'string'/, 'Priority must be type-checked before presentation.')
assert.doesNotMatch(source, /finding_ids[^\n]*<|finding_ids[^\n]*\{/, 'Internal finding identifiers must not become visible recommendation fields.')
assert.doesNotMatch(source, /JSON\.stringify\(recommendation\)/, 'Raw backend recommendation payloads must not leak into the UI.')
assert.match(source, /formatScore\(typeof value==='number'\?value:null\)/, 'Unknown/non-numeric score states must render through the missing-score contract.')

assert.match(runButtonSource, /method: 'GET'/, 'Quality execution control must verify live executability before enabling the action.')
assert.match(runButtonSource, /availability !== 'ready'/, 'Quality execution control must fail closed until executable controls are confirmed.')
assert.match(runButtonSource, /No enabled controls/, 'The UI must present a truthful non-executable state when no controls apply.')
assert.match(runButtonSource, /cache: 'no-store'/, 'Executable-control availability must not rely on stale client cache state.')
assert.match(runRouteSource, /enabledQualityRuleCount/, 'The API must resolve enabled rules independently of the presentation layer.')
assert.match(runRouteSource, /enabledRuleCount === 0/, 'The API must reject execution when no enabled quality rules apply.')
assert.match(runRouteSource, /status: 409/, 'Missing executable controls must be represented as a conflict, not a queued no-op.')
assert.match(runRouteSource, /'Cache-Control': 'private, no-store'/, 'Quality execution availability must be returned as non-cacheable user-scoped state.')
assert.match(runRouteSource, /rule\.dataset_version_id === datasetVersionId/, 'Version-scoped controls must only authorize execution for the matching dataset version.')

console.log('data quality presentation adversarial audit: PASS', {
  rawPayloadLeakage: false,
  approvalBoundaryPreserved: true,
  unknownScorePresentation: 'N/A',
  emptyRuleExecution: 'fail-closed',
  executionAvailability: 'live-and-version-scoped',
})

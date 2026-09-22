import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../lib/catalog/lineage-enrichment.ts', import.meta.url), 'utf8')

test('object-view lineage records per-target probe failures explicitly', () => {
  const start = source.indexOf("const lineageTargets = assets.filter")
  const end = source.indexOf("transformations = [...new Map", start)
  assert.ok(start >= 0)
  assert.ok(end > start)
  const scan = source.slice(start, end)

  assert.match(scan, /failed: false/)
  assert.match(scan, /failed: true/)
  assert.match(scan, /failed_query_count: failedTargets/)
})

test('lineage enrichment fails closed only when every candidate view probe throws', () => {
  const start = source.indexOf("const lineageTargets = assets.filter")
  const end = source.indexOf("transformations = [...new Map", start)
  const scan = source.slice(start, end)

  assert.match(scan, /lineageTargets\.length > 0 && failedTargets === lineageTargets\.length/)
  assert.match(scan, /throw new Error\(\`Lineage transformation discovery failed for all/)
  assert.doesNotMatch(scan, /failedTargets > 0\) \{\s*throw/)
})

test('top-level enrichment catch persists FAILED evidence and rethrows', () => {
  const catchIndex = source.lastIndexOf("} catch (error) {")
  const catchBlock = source.slice(catchIndex)
  assert.match(catchBlock, /status: 'FAILED'/)
  assert.match(catchBlock, /finishLineageRun/)
  assert.match(catchBlock, /throw error/)
})

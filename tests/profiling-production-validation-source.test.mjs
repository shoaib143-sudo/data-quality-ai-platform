import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../scripts/verify-profiling-production-validation.mjs', import.meta.url), 'utf8')

test('live profiling estate enumeration is paginated and stable', () => {
  assert.ok(source.includes('const pageSize = 500'))
  assert.ok(source.includes("from('dataset_execution_sources')"))
  assert.ok(source.includes(".select('id,dataset_version_id,source_type,updated_at')"))
  assert.ok(source.includes(".order('id', { ascending: false })"))
  const rangeOccurrences = source.split('.range(from, from + pageSize - 1)').length - 1
  assert.ok(rangeOccurrences >= 3, `expected pagination for completed runs, all attempts, and active sources; saw ${rangeOccurrences}`)
})

test('live profiling contract validation uses bounded concurrency', () => {
  assert.ok(source.includes('const validationBatchSize = 10'))
  assert.ok(source.includes('latestCompletedRuns.slice(index, index + validationBatchSize)'))
  assert.ok(source.includes('await Promise.all(batch.map(async (run) => {'))
})


test('retained profiling evidence excludes source credentials and connection details', () => {
  for (const forbidden of ['source_uri', 'execution_config', 'credential_ref', 'jdbc_url', 'service_role_key']) {
    assert.equal(source.toLowerCase().includes(forbidden), false, `live evidence source must not select or emit ${forbidden}`)
  }
})

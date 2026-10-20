import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true }
  return next(specifier, context)
} })

const { loadSupabaseHeldOutReplayBytes } = await import('../lib/agents/supabase-held-out-replay-reader.ts')
const { computeReplayManifestHash } = await import('../lib/agents/held-out-replay-byte-resolver.ts')
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
const projectId = '10000000-0000-4000-8000-000000000001'
const manifestId = '20000000-0000-4000-8000-000000000001'
const datasetVersionId = 'dataset-v1'
const trainingBytes = '{"case":"training"}'
const heldoutBytes = '\uFEFF{"case":"heldout"}'
const trainingKey = createHash('sha256').update('training-case').digest('hex')
const heldoutKey = createHash('sha256').update('heldout-case').digest('hex')
const evidenceCutoffAt = '2026-10-19T00:00:00.000Z'
const rows = [
  { project_id: projectId, dataset_id: manifestId, case_key: trainingKey, split: 'TRAINING', source_case_ref: `learning/${projectId}/candidate/replay_input/v1/${digest(trainingBytes).slice(7)}`, payload_hash: digest(trainingBytes) },
  { project_id: projectId, dataset_id: manifestId, case_key: heldoutKey, split: 'HELD_OUT', source_case_ref: `learning/${projectId}/candidate/replay_input/v1/${digest(heldoutBytes).slice(7)}`, payload_hash: digest(heldoutBytes) },
]
const manifest = {
  projectId, manifestId, datasetVersionId, evidenceCutoffAt,
  cases: rows.map(row => ({ caseKey: row.case_key, split: row.split, sourceCaseRef: row.source_case_ref, payloadHash: row.payload_hash })),
}
const manifestHash = computeReplayManifestHash(manifest)
const header = { id: manifestId, project_id: projectId, dataset_version: datasetVersionId, evidence_cutoff_at: evidenceCutoffAt, manifest_hash: manifestHash, status: 'SEALED', case_count: 2 }
const expected = { projectId, manifestId, datasetVersionId, manifestHash }
const state = { headerError: null, caseError: null, headerOverride: null, rowsOverride: null, downloadError: null, tamper: false, missing: false, wrongProject: false }
const calls = []

function makeClient() {
  return {
    schema(schema) {
      return { from(table) {
        const filters = []
        let requestedRange = null
        const query = {
          select(columns) { calls.push({ type: 'select', schema, table, columns }); return query },
          eq(key, value) { filters.push([key, value]); return query },
          order() { return query },
          range(start, end) { requestedRange = [start, end]; calls.push({ type: 'range', table, start, end }); return query },
          async maybeSingle() {
            calls.push({ type: 'maybeSingle', table, filters })
            if (state.headerError) return { data: null, error: { message: state.headerError } }
            const data = state.headerOverride ?? { ...header, project_id: state.wrongProject ? '40000000-0000-4000-8000-000000000001' : header.project_id }
            return { data, error: null }
          },
          then(resolve, reject) {
            calls.push({ type: 'selectRows', table, filters })
            if (state.caseError) return Promise.resolve({ data: null, error: { message: state.caseError } }).then(resolve, reject)
            const sourceRows = state.rowsOverride ?? rows
            const orderedRows = sourceRows.slice().sort((left, right) => left.case_key < right.case_key ? -1 : left.case_key > right.case_key ? 1 : 0)
            const page = requestedRange ? orderedRows.slice(requestedRange[0], requestedRange[1] + 1) : orderedRows
            return Promise.resolve({ data: page, error: null }).then(resolve, reject)
          },
        }
        return query
      } }
    },
    storage: { from(bucket) { return { async download(key) {
      calls.push({ type: 'download', bucket, key })
      if (state.downloadError) return { data: null, error: { message: state.downloadError } }
      if (state.missing) return { data: null, error: { statusCode: 404, message: 'not found' } }
      let value = key.endsWith(digest(heldoutBytes).slice(7)) ? heldoutBytes : trainingBytes
      if (state.tamper) value += 'x'
      return { data: new Blob([value]), error: null }
    } } } },
  }
}
const load = (overrides = {}) => loadSupabaseHeldOutReplayBytes({
  client: makeClient(), bucketName: 'private-learning', expected, expectedCaseKeys: [heldoutKey], ...overrides,
})

const result = await load()
assert.equal(result.length, 1)
assert.equal(result[0].input.bytes, heldoutBytes)
assert.equal(result[0].input.hash, digest(heldoutBytes))
assert.ok(calls.some(call => call.type === 'download' && call.bucket === 'private-learning'))
assert.ok(calls.some(call => call.type === 'range' && call.start === 0 && call.end === 1))

state.tamper = true
await assert.rejects(load, /REPLAY_PAYLOAD_HASH_MISMATCH/)
state.tamper = false
state.missing = true
await assert.rejects(load, /REPLAY_SOURCE_MISSING/)
state.missing = false
state.downloadError = 'storage timeout'
await assert.rejects(load, /REPLAY_STORAGE_READ_FAILED/)
state.downloadError = null
state.headerError = 'database unavailable'
await assert.rejects(load, /REPLAY_MANIFEST_READ_FAILED/)
state.headerError = null
state.caseError = 'database unavailable'
await assert.rejects(load, /REPLAY_CASES_READ_FAILED/)
state.caseError = null
state.wrongProject = true
await assert.rejects(load, /REPLAY_MANIFEST_STALE/)
state.wrongProject = false
state.rowsOverride = rows.map(row => ({ ...row, payload_hash: null }))
await assert.rejects(load, /REPLAY_PAYLOAD_HASH_MISSING/)
state.rowsOverride = null
state.rowsOverride = rows.slice(0, 1)
await assert.rejects(load, /REPLAY_CASES_MISSING/)
state.rowsOverride = null
state.rowsOverride = rows.map(row => ({ ...row, source_case_ref: 'https://attacker.invalid/payload' }))
await assert.rejects(load, /REPLAY_STORAGE_KEY_INVALID/)
state.rowsOverride = null

// Exercise a second deterministic page while keeping all fixture records synthetic.
const pagedRows = Array.from({ length: 501 }, (_, index) => {
  const bytes = index === 500 ? heldoutBytes : `training-${index}`
  const key = createHash('sha256').update(`paged-case-${index}`).digest('hex')
  return {
    project_id: projectId,
    dataset_id: manifestId,
    case_key: key,
    split: index === 500 ? 'HELD_OUT' : 'TRAINING',
    source_case_ref: `learning/${projectId}/candidate/replay_input/v1/${digest(bytes).slice(7)}`,
    payload_hash: digest(bytes),
  }
})
const pagedManifest = {
  projectId, manifestId, datasetVersionId, evidenceCutoffAt,
  cases: pagedRows.map(row => ({ caseKey: row.case_key, split: row.split, sourceCaseRef: row.source_case_ref, payloadHash: row.payload_hash })),
}
state.headerOverride = { ...header, case_count: pagedRows.length, manifest_hash: computeReplayManifestHash(pagedManifest) }
state.rowsOverride = pagedRows
const pagedResult = await load({ expected: { ...expected, manifestHash: state.headerOverride.manifest_hash }, expectedCaseKeys: [pagedRows[500].case_key] })
assert.equal(pagedResult.length, 1)
assert.equal(pagedResult[0].input.bytes, heldoutBytes)
assert.ok(calls.some(call => call.type === 'range' && call.start === 500 && call.end === 500))
state.headerOverride = null
state.rowsOverride = null

console.log('Supabase held-out reader uses persisted scoped manifest rows, private Storage bytes, digest verification, and fails closed on legacy hashes, tampering, access errors, missing objects, and unsafe references.')

import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { computeReplayManifestHash } from '../lib/agents/held-out-replay-byte-resolver.ts'

const migration = fs.readFileSync(new URL('../supabase/migrations/20260929000300_learning_benchmark_dataset_manifest.sql', import.meta.url), 'utf8')
const payloadMigration = fs.readFileSync(new URL('../supabase/migrations/20261020045825_bind_learning_case_payload_hashes.sql', import.meta.url), 'utf8')
const fixture = fs.readFileSync(new URL('./test-learning-benchmark-dataset-manifest.sql', import.meta.url), 'utf8')
const digest = (value) => createHash('sha256').update(value).digest('hex')
const cases = [
  { case_key: '0'.repeat(64), split: 'TRAINING', source_case_ref: 'learning/10000000-0000-4000-8000-000000000001/fixture/replay_input/v1/träining:|case', payload_hash: `sha256:${digest('fixture-training-payload')}` },
  { case_key: 'f'.repeat(64), split: 'HELD_OUT', source_case_ref: 'learning/10000000-0000-4000-8000-000000000001/fixture/replay_input/v1/fixture-held-out', payload_hash: `sha256:${digest('fixture-held-out-payload')}` },
]
const fields = ['10000000-0000-4000-8000-000000000001', 'fixture-snapshot-1', String(cases.length),
  ...cases.slice().sort((a, b) => a.case_key < b.case_key ? -1 : a.case_key > b.case_key ? 1 : 0)
    .flatMap(item => [item.case_key, item.split, item.source_case_ref, item.payload_hash])]
const canonical = fields.map(field => `${Buffer.byteLength(field, 'utf8')}:${field}`).join('')
const manifestHash = `sha256:${digest(canonical)}`
const resolverManifestHash = computeReplayManifestHash({
  projectId: '10000000-0000-4000-8000-000000000001',
  manifestId: '20000000-0000-4000-8000-000000000001',
  datasetVersionId: 'fixture-snapshot-1',
  evidenceCutoffAt: '2026-10-19T00:00:00.000Z',
  cases: cases.map(item => ({ caseKey: item.case_key, split: item.split, sourceCaseRef: item.source_case_ref, payloadHash: item.payload_hash })),
})

assert.match(migration, /create table agent\.learning_benchmark_dataset_manifests/)
assert.match(migration, /case_key text not null check \(case_key ~ '\^\[a-f0-9\]\{64\}\$'\)/)
assert.match(migration, /split text not null check \(split in \('TRAINING',\s*'HELD_OUT'\)\)/)
assert.match(migration, /manifest hash does not match canonical case manifest/)
assert.match(migration, /requires a registered immutable dataset manifest/)
assert.match(migration, /c\.split = 'HELD_OUT'/)
assert.match(payloadMigration, /add column payload_hash text/i)
assert.match(payloadMigration, /learning_benchmark_manifest_digest/i)
assert.match(payloadMigration, /payload-bound case manifest/i)
assert.match(payloadMigration, /each case requires a SHA-256 payload hash/i)
assert.match(payloadMigration, /dataset version must be 1-100 ASCII/i)
assert.match(payloadMigration, /collate "C"/i)
assert.match(payloadMigration, /payload_hash\)/i)
assert.match(fixture, /register_learning_benchmark_dataset\(/)
assert.match(fixture, /payload_hash/)
assert.match(fixture, /learning_benchmark_manifest_digest/)
assert.match(fixture, /digest_matches_typescript/)
assert.match(fixture, new RegExp(manifestHash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
assert.match(fixture, /mismatched aggregate unexpectedly succeeded/)
assert.match(fixture, /failed benchmark was not rolled back/)
assert.match(fixture, /training case benchmark unexpectedly succeeded/)
assert.match(fixture, /learning benchmark dataset registration and paired-binding SQL fixture passed/)
assert.equal(manifestHash.length, 71)
assert.equal(resolverManifestHash, manifestHash)
assert.notEqual(cases[0].case_key, cases[1].case_key)
console.log('Learning benchmark dataset manifest contract pins immutable cases, splits, payload hashes, and held-out binding.')

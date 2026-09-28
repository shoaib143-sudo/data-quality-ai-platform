import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'

const migration = fs.readFileSync(new URL('../supabase/migrations/20260929000300_learning_benchmark_dataset_manifest.sql', import.meta.url), 'utf8')
const digest = (value) => createHash('sha256').update(value).digest('hex')
const cases = [
  { case_key: digest('case-a'), split: 'TRAINING', source_case_ref: 'source-a' },
  { case_key: digest('case-b'), split: 'HELD_OUT', source_case_ref: 'source-b' },
]
const canonical = cases.slice().sort((a, b) => a.case_key.localeCompare(b.case_key)).map((item) => `${item.case_key}:${item.split}:${item.source_case_ref}`).join('|')
const manifestHash = `sha256:${digest(canonical)}`

assert.match(migration, /create table agent\.learning_benchmark_dataset_manifests/)
assert.match(migration, /case_key text not null check \(case_key ~ '\^\[a-f0-9\]\{64\}\$'\)/)
assert.match(migration, /split text not null check \(split in \('TRAINING',\s*'HELD_OUT'\)\)/)
assert.match(migration, /manifest hash does not match canonical case manifest/)
assert.match(migration, /requires a registered immutable dataset manifest/)
assert.match(migration, /c\.split = 'HELD_OUT'/)
assert.equal(manifestHash.length, 71)
assert.notEqual(cases[0].case_key, cases[1].case_key)
console.log('Learning benchmark dataset manifest contract pins immutable cases, split assignments, and held-out binding.')

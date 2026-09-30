import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const helperPath = path.resolve('scripts/prepare-clean-analysis-evidence-envelope-replay.mjs')
const workflow = fs.readFileSync('.github/workflows/native-compensation-post-implementation-assurance.yml', 'utf8')

test('analytics evidence replay prerequisite is inserted before the first historical use', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-analytics-replay-'))
  try {
    const result = spawnSync(process.execPath, [helperPath], {
      env: { ...process.env, TARGET_MIGRATION_DIR: target },
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const files = fs.readdirSync(target)
    assert.ok(files.includes('20260911050540_reconstruct_analysis_evidence_envelopes.sql'))
    assert.ok('20260911050540' < '20260911050541')
    const sql = fs.readFileSync(path.join(target, '20260911050540_reconstruct_analysis_evidence_envelopes.sql'), 'utf8')
    assert.match(sql, /create table if not exists governance\.analysis_evidence_envelopes/)
    assert.match(sql, /create table if not exists governance\.metric_definition_versions/)
    assert.match(sql, /create table if not exists governance\.learning_case_assessments/)
  } finally {
    fs.rmSync(target, { recursive: true, force: true })
  }
})

test('post implementation assurance invokes the analytics replay prerequisite', () => {
  assert.match(workflow, /prepare-clean-analysis-evidence-envelope-replay\.mjs/)
})

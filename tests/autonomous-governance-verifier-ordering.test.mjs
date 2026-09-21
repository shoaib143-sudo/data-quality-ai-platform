import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const verifierPath = 'scripts/verify-autonomous-governance-operations.mjs'
const verifier = fs.readFileSync(verifierPath, 'utf8')

test('autonomous governance verifier accepts the current scheduled worker ordering', () => {
  const result = spawnSync(process.execPath, [verifierPath], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('incident SLA ordering checks response projection rather than the Promise.all binding', () => {
  assert.match(verifier, /const incidentSlaEvaluationIndex = workerService\.indexOf\('evaluateIncidentSlaEscalations\(50\)'\)/)
  assert.match(verifier, /workerService\.indexOf\('\\n    incidentEscalations,', incidentSlaEvaluationIndex\)/)
  assert.doesNotMatch(verifier, /workerService\.indexOf\('evaluateIncidentSlaEscalations\(50\)'\) > workerService\.indexOf\('incidentEscalations'\)/)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = process.cwd()
const verifier = path.join(root, 'scripts/verify-certification-best-practice-hardening-v2.mjs')
const sourcePath = path.join(root, 'infra/platform-assurance/certification-best-practice-hardening-v2.json')
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

function verify(profile) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datanexus-cert-hardening-'))
  const candidatePath = path.join(tempDir, 'profile.json')
  fs.writeFileSync(candidatePath, `${JSON.stringify(profile, null, 2)}\n`)
  const result = spawnSync(process.execPath, [verifier], {
    cwd: root,
    env: { ...process.env, DATANEXUS_CERTIFICATION_HARDENING_PROFILE: candidatePath },
    encoding: 'utf8',
  })
  fs.rmSync(tempDir, { recursive: true, force: true })
  return result
}

function mutated(mutator) {
  const candidate = structuredClone(source)
  mutator(candidate)
  return candidate
}

test('authoritative hardening profile passes', () => {
  const result = verify(source)
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('preview evidence cannot be promoted to production evidence', () => {
  const result = verify(mutated(profile => { profile.truthRules.previewEvidenceMayProveProduction = true }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /previewEvidenceMayProveProduction/)
})

test('unverifiable provenance cannot satisfy production verification', () => {
  const result = verify(mutated(profile => { profile.truthRules.unverifiableBuildProvenanceMayProveProduction = true }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unverifiableBuildProvenanceMayProveProduction/)
})

test('release dependency inventory cannot be omitted', () => {
  const result = verify(mutated(profile => { profile.truthRules.missingReleaseDependencyInventoryMaySatisfyReleaseEvidence = true }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /missingReleaseDependencyInventoryMaySatisfyReleaseEvidence/)
})

test('self-authored provenance cannot prove production', () => {
  const result = verify(mutated(profile => { profile.truthRules.selfAuthoredProvenanceMayProveProduction = true }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /selfAuthoredProvenanceMayProveProduction/)
})

test('artifact digest binding is mandatory', () => {
  const required = 'build provenance binds source revision, builder identity and artifact digest'
  const result = verify(mutated(profile => { profile.supplyChainRequirements = profile.supplyChainRequirements.filter(item => item !== required) }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /artifact digest/)
})

test('independent assurance separation remains mandatory', () => {
  const required = 'independent assurance producer is separated from the implementation producer'
  const result = verify(mutated(profile => { profile.postImplementationRequirements = profile.postImplementationRequirements.filter(item => item !== required) }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /independent assurance producer/)
})

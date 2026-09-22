import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const r2 = fs.readFileSync(new URL('../lib/storage/r2.ts', import.meta.url), 'utf8')
const certification = fs.readFileSync(new URL('../app/api/internal/storage/certify-r2/route.ts', import.meta.url), 'utf8')

test('R2 adapter exposes bounded read-only assurance residue inspection', () => {
  assert.match(r2, /export async function listR2ObjectKeysByPrefix/)
  assert.match(r2, /'list-type': '2'/)
  assert.match(r2, /'max-keys': String\(maxKeys\)/)
  assert.match(r2, /maxKeys > 1000/)
  assert.match(r2, /<Key>\(\[\\s\\S\]\*\?\)<\\\/Key>/)
  assert.doesNotMatch(r2.slice(r2.indexOf('export async function listR2ObjectKeysByPrefix'), r2.indexOf('export class R2StorageAdapter')), /DELETE/)
})

test('R2 certification fails closed when assurance residue cannot be verified', () => {
  assert.match(certification, /listR2ObjectKeysByPrefix\(\{ prefix: '_assurance', maxKeys: 100 \}\)/)
  assert.match(certification, /R2_ASSURANCE_RESIDUE_CHECK_FAILED/)
  assert.match(certification, /R2_ASSURANCE_OBJECTS_PRESENT/)
  assert.match(certification, /assuranceResidue:/)
  assert.match(certification, /objectCount: assuranceResidueCount/)
  assert.match(certification, /sampleKeys: assuranceResidueSample/)
  assert.match(certification, /truncated: assuranceResidueTruncated/)
})

test('R2 assurance residue certification is observation-only', () => {
  const residueSection = certification.slice(
    certification.indexOf("listR2ObjectKeysByPrefix({ prefix: '_assurance'"),
    certification.indexOf('const blockers: string[]'),
  )
  assert.doesNotMatch(residueSection, /deleteObject|putObject|POST|apply/)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = process.cwd()
const evaluator = path.join(root, 'scripts/evaluate-post-implementation-certification.mjs')
const contract = JSON.parse(fs.readFileSync(path.join(root, 'infra/platform-assurance/post-implementation-certification-contract.json'), 'utf8'))
const sourceCommit = '0123456789abcdef0123456789abcdef01234567'

function baseManifest(claimLevel = 'CERTIFIED') {
  const now = new Date().toISOString()
  const evidenceRecords = contract.mandatoryEvidenceClasses
    .filter(item => item.requiredFor.includes('CERTIFIED') || (claimLevel === 'PRODUCTION_VERIFIED' && item.requiredFor.includes('PRODUCTION_VERIFIED')))
    .map(item => ({
      evidenceClass: item.id,
      result: 'PASS',
      sourceCommit,
      environment: claimLevel === 'PRODUCTION_VERIFIED' && item.requiredFor.includes('PRODUCTION_VERIFIED') ? 'PRODUCTION' : 'CI',
      observedAt: now,
      producer: 'independent-assurance-ci',
      evidenceRef: `github-actions://evidence/${item.id}`,
      freshnessPolicy: { maxAgeSeconds: 3600 },
    }))

  const revalidation = Object.entries(contract.postImplementationRevalidation)
    .filter(([, required]) => required === true)
    .map(([gate]) => ({
      gate,
      result: claimLevel === 'CERTIFIED' && gate === 'productionValidationWhenApplicable' ? 'NOT_APPLICABLE' : 'PASS',
      evidenceRef: `github-actions://revalidation/${gate}`,
      ...(claimLevel === 'CERTIFIED' && gate === 'productionValidationWhenApplicable'
        ? { justification: 'Production validation is intentionally deferred until an authorized production release.' }
        : {}),
    }))

  return {
    schemaVersion: 1,
    claimLevel,
    sourceCommit,
    implementationProducer: 'implementation-pipeline',
    independentAssuranceProducer: 'independent-assurance-ci',
    acceptancePaths: contract.requiredAcceptancePaths.map(pathName => ({ path: pathName, result: 'PASS', evidenceRef: `github-actions://acceptance/${pathName}` })),
    evidenceRecords,
    revalidation,
    ...(claimLevel === 'PRODUCTION_VERIFIED' ? {
      productionBindings: Object.fromEntries(contract.productionVerificationBindings.map(binding => [binding, binding === 'certifiedSourceCommit' ? sourceCommit : `evidence://${binding}`])),
    } : {}),
  }
}

function evaluate(manifest) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datanexus-cert-decision-'))
  const manifestPath = path.join(tempDir, 'evidence.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  const result = spawnSync(process.execPath, [evaluator, manifestPath], {
    cwd: root,
    env: { ...process.env, DATANEXUS_SOURCE_COMMIT: sourceCommit },
    encoding: 'utf8',
  })
  fs.rmSync(tempDir, { recursive: true, force: true })
  return result
}

test('complete CERTIFIED evidence passes without pretending production is verified', () => {
  const result = evaluate(baseManifest('CERTIFIED'))
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /"claimLevel": "CERTIFIED"/)
})

test('required NOT_MEASURED evidence fails closed', () => {
  const manifest = baseManifest()
  manifest.evidenceRecords[0].result = 'NOT_MEASURED'
  const result = evaluate(manifest)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /non-certifying result/)
})

test('stale evidence cannot satisfy certification', () => {
  const manifest = baseManifest()
  manifest.evidenceRecords[0].observedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  manifest.evidenceRecords[0].freshnessPolicy.maxAgeSeconds = 60
  const result = evaluate(manifest)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /is stale/)
})

test('implementation producer cannot self-certify independent assurance', () => {
  const manifest = baseManifest()
  manifest.independentAssuranceProducer = manifest.implementationProducer
  const result = evaluate(manifest)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /must differ/)
})

test('missing adversarial acceptance evidence is rejected', () => {
  const manifest = baseManifest()
  manifest.acceptancePaths = manifest.acceptancePaths.filter(item => item.path !== 'UNAUTHORIZED_ADVERSARIAL')
  const result = evaluate(manifest)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /UNAUTHORIZED_ADVERSARIAL/)
})

test('PRODUCTION_VERIFIED requires production-only evidence from production', () => {
  const manifest = baseManifest('PRODUCTION_VERIFIED')
  const productionClass = contract.mandatoryEvidenceClasses.find(item => item.requiredFor.includes('PRODUCTION_VERIFIED') && !item.requiredFor.includes('CERTIFIED'))
  assert.ok(productionClass)
  manifest.evidenceRecords.find(item => item.evidenceClass === productionClass.id).environment = 'PREVIEW'
  const result = evaluate(manifest)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /must come from the PRODUCTION environment/)
})

test('PRODUCTION_VERIFIED requires exact certified source binding', () => {
  const manifest = baseManifest('PRODUCTION_VERIFIED')
  manifest.productionBindings.certifiedSourceCommit = 'fedcba9876543210fedcba9876543210fedcba98'
  const result = evaluate(manifest)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /does not match the evaluated source commit/)
})

test('PRODUCTION_VERIFIED cannot mark production validation not applicable', () => {
  const manifest = baseManifest('PRODUCTION_VERIFIED')
  const gate = manifest.revalidation.find(item => item.gate === 'productionValidationWhenApplicable')
  gate.result = 'NOT_APPLICABLE'
  gate.justification = 'Production verification cannot be bypassed for a production-verified claim.'
  const result = evaluate(manifest)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /requires productionValidationWhenApplicable to PASS/)
})

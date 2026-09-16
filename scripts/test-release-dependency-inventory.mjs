import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = process.cwd()
const generator = path.join(root, 'scripts/generate-release-dependency-inventory.mjs')
const verifier = path.join(root, 'scripts/verify-release-dependency-inventory.mjs')
const sourceCommit = '0123456789abcdef0123456789abcdef01234567'

function generate(tempDir) {
  const output = path.join(tempDir, 'inventory.json')
  const result = spawnSync(process.execPath, [generator, output], {
    cwd: root,
    env: { ...process.env, DATANEXUS_SOURCE_COMMIT: sourceCommit },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return output
}

function verify(file, commit = sourceCommit) {
  return spawnSync(process.execPath, [verifier, file], {
    cwd: root,
    env: { ...process.env, DATANEXUS_SOURCE_COMMIT: commit },
    encoding: 'utf8',
  })
}

function rewriteIntegrity(candidate) {
  const material = {
    schemaVersion: candidate.schemaVersion,
    kind: candidate.kind,
    sourceCommit: candidate.sourceCommit,
    lockfileSha256: candidate.lockfileSha256,
    packageManager: candidate.packageManager,
    directProductionDependencies: candidate.directProductionDependencies,
    dependencyComponents: candidate.dependencyComponents,
  }
  candidate.inventorySha256 = `sha256:${crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex')}`
}

test('generated dependency inventory verifies against exact source and lockfile', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datanexus-deps-'))
  try {
    const output = generate(tempDir)
    const result = verify(output)
    assert.equal(result.status, 0, result.stderr || result.stdout)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('stale source revision is rejected', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datanexus-deps-'))
  try {
    const output = generate(tempDir)
    const result = verify(output, 'fedcba9876543210fedcba9876543210fedcba98')
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /does not match expected exact head/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('tampered dependency component is rejected even if file remains valid JSON', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datanexus-deps-'))
  try {
    const output = generate(tempDir)
    const candidate = JSON.parse(fs.readFileSync(output, 'utf8'))
    candidate.dependencyComponents[0].version = `${candidate.dependencyComponents[0].version}-tampered`
    fs.writeFileSync(output, JSON.stringify(candidate, null, 2))
    const result = verify(output)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /integrity digest is invalid/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('missing direct dependency coverage is rejected independently of integrity digest', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datanexus-deps-'))
  try {
    const output = generate(tempDir)
    const candidate = JSON.parse(fs.readFileSync(output, 'utf8'))
    const target = candidate.directProductionDependencies[0]?.name
    assert.ok(target)
    candidate.dependencyComponents = candidate.dependencyComponents.filter(component => component.name !== target)
    rewriteIntegrity(candidate)
    fs.writeFileSync(output, JSON.stringify(candidate, null, 2))
    const result = verify(output)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /absent from dependencyComponents/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

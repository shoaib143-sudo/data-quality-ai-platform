import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const tree = execFileSync('git', ['rev-parse', `${head}^{tree}`], { encoding: 'utf8' }).trim()
const artifact = 'release-evidence/reference-build.tgz'
mkdirSync('release-evidence', { recursive: true })
writeFileSync(artifact, Buffer.from('reference-build-test'))

try {
  execFileSync(process.execPath, ['scripts/generate-reference-build-manifest.mjs', artifact], {
    stdio: 'pipe',
    env: {
      ...process.env,
      GITHUB_SHA: head,
      GITHUB_REPOSITORY: 'shoaib143-sudo/data-quality-ai-platform',
      GITHUB_WORKFLOW: 'Release Provenance Test',
      GITHUB_RUN_ID: '1',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_REF: 'refs/pull/1/merge',
    },
  })

  const manifest = JSON.parse(readFileSync('release-evidence/reference-build-manifest.json', 'utf8'))
  assert.equal(manifest.kind, 'SIGNED_REFERENCE_BUILD')
  assert.equal(manifest.productionArtifactEquivalenceClaimed, false)
  assert.equal(manifest.sourceCommitSha, head)
  assert.equal(manifest.sourceTreeSha, tree)
  assert.equal(manifest.repository, 'shoaib143-sudo/data-quality-ai-platform')
  assert.match(manifest.lockfileSha256, /^[0-9a-f]{64}$/)
  assert.match(manifest.migrationSetSha256, /^[0-9a-f]{64}$/)
  assert.equal(manifest.referenceBuild.sha256, createHash('sha256').update(Buffer.from('reference-build-test')).digest('hex'))
  assert(manifest.migrationCount > 0)
  assert(manifest.latestMigration?.endsWith('.sql'))
} finally {
  rmSync('release-evidence', { recursive: true, force: true })
}

console.log('Reference build manifest unit test passed.')

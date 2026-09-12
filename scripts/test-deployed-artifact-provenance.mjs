import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildDeployedArtifactManifest,
  hashDeployedArtifact,
} from '../lib/release-assurance/deployed-artifact-provenance.mjs'

const SHA = 'a'.repeat(40)

async function seed(root, reverse = false) {
  const files = [
    ['.next/server/app.js', 'server-app'],
    ['.next/static/chunk.js', 'static-chunk'],
    ['.next/BUILD_ID', 'build-123'],
    ['package.json', '{"name":"fixture"}\n'],
    ['pnpm-lock.yaml', 'lockfileVersion: 9\n'],
    ['public/logo.txt', 'logo'],
  ]
  const ordered = reverse ? [...files].reverse() : files
  for (const [path, content] of ordered) {
    const full = join(root, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, content)
  }
}

function productionEnv(overrides = {}) {
  return {
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_DEPLOYMENT_ID: 'dpl_AbCd1234',
    VERCEL_GIT_COMMIT_SHA: SHA,
    VERCEL_PROJECT_PRODUCTION_URL: 'example.vercel.app',
    VERCEL_REGION: 'iad1',
    ...overrides,
  }
}

const roots = []
async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'deployed-provenance-test-'))
  roots.push(root)
  return root
}

try {
  const firstRoot = await tempRoot()
  const secondRoot = await tempRoot()
  await seed(firstRoot, false)
  await seed(secondRoot, true)
  const first = await hashDeployedArtifact(firstRoot)
  const second = await hashDeployedArtifact(secondRoot)
  assert.equal(first.artifactDigest, second.artifactDigest, 'digest must not depend on file creation order')
  assert.match(first.artifactDigest, /^sha256:[a-f0-9]{64}$/)

  const manifest = await buildDeployedArtifactManifest({ root: firstRoot, env: productionEnv(), now: new Date('2026-09-13T00:00:00Z') })
  assert.equal(manifest.artifactClass, 'PRODUCTION_DEPLOYMENT')
  assert.equal(manifest.deploymentId, 'dpl_AbCd1234')
  assert.equal(manifest.sourceCommitSha, SHA)
  assert.equal(manifest.artifactDigest, first.artifactDigest)
  assert.equal(manifest.generatedAt, '2026-09-13T00:00:00.000Z')

  await writeFile(join(firstRoot, '.next/server/app.js'), 'tampered-server-app')
  const tampered = await hashDeployedArtifact(firstRoot)
  assert.notEqual(tampered.artifactDigest, first.artifactDigest, 'artifact tampering must change the digest')

  const selfRoot = await tempRoot()
  await seed(selfRoot)
  const beforeSelfManifest = await hashDeployedArtifact(selfRoot)
  await mkdir(join(selfRoot, 'public/.well-known'), { recursive: true })
  await writeFile(join(selfRoot, 'public/.well-known/deployed-artifact-provenance.json'), '{"mutable":"one"}')
  const afterSelfManifestOne = await hashDeployedArtifact(selfRoot)
  await writeFile(join(selfRoot, 'public/.well-known/deployed-artifact-provenance.json'), '{"mutable":"two"}')
  const afterSelfManifestTwo = await hashDeployedArtifact(selfRoot)
  assert.equal(afterSelfManifestOne.artifactDigest, beforeSelfManifest.artifactDigest)
  assert.equal(afterSelfManifestTwo.artifactDigest, beforeSelfManifest.artifactDigest)

  await assert.rejects(
    buildDeployedArtifactManifest({ root: secondRoot, env: productionEnv({ VERCEL_DEPLOYMENT_ID: '' }) }),
    /VERCEL_DEPLOYMENT_ID is required/,
  )
  await assert.rejects(
    buildDeployedArtifactManifest({ root: secondRoot, env: productionEnv({ VERCEL_GIT_COMMIT_SHA: 'abc' }) }),
    /VERCEL_GIT_COMMIT_SHA must be a 40-character Git SHA/,
  )

  const preview = await buildDeployedArtifactManifest({
    root: secondRoot,
    env: productionEnv({ VERCEL_ENV: 'preview', VERCEL_DEPLOYMENT_ID: 'dpl_Preview1234' }),
  })
  assert.equal(preview.artifactClass, 'NON_PRODUCTION_DEPLOYMENT')
  assert.equal(preview.environment, 'preview')

  assert.equal(await buildDeployedArtifactManifest({ root: secondRoot, env: {} }), null)

  const secret = 'do-not-serialize-this-secret-value'
  const secretManifest = await buildDeployedArtifactManifest({
    root: secondRoot,
    env: productionEnv({ SECRET_PROBE: secret }),
  })
  assert.equal(JSON.stringify(secretManifest).includes(secret), false, 'arbitrary secret values must never enter the manifest')

  const symlinkRoot = await tempRoot()
  await seed(symlinkRoot)
  await symlink('../BUILD_ID', join(symlinkRoot, '.next/server/build-id-link'))
  await assert.rejects(hashDeployedArtifact(symlinkRoot), /Symbolic links are not allowed/)

  console.log(JSON.stringify({
    status: 'PASS',
    tests: [
      'deterministic-ordering',
      'production-identity-binding',
      'tamper-changes-digest',
      'self-manifest-exclusion',
      'missing-deployment-fails-closed',
      'invalid-sha-fails-closed',
      'preview-cannot-claim-production',
      'non-vercel-skips',
      'secret-not-serialized',
      'symlink-rejected',
    ],
  }))
} finally {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
}

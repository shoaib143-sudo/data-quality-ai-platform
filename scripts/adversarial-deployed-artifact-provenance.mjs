import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildDeployedArtifactManifest,
  hashDeployedArtifact,
} from '../lib/release-assurance/deployed-artifact-provenance.mjs'

const VALID_SHA = 'b'.repeat(40)
const roots = []
const scenarios = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'deployed-provenance-adversarial-'))
  roots.push(root)
  for (const [path, content] of [
    ['.next/server/route.js', 'authoritative-route'],
    ['.next/static/runtime.js', 'runtime'],
    ['.next/BUILD_ID', 'production-build-id'],
    ['package.json', '{"name":"adversarial-fixture"}'],
    ['pnpm-lock.yaml', 'lockfileVersion: 9'],
    ['public/asset.txt', 'asset'],
  ]) {
    const target = join(root, path)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, content)
  }
  return root
}

function env(overrides = {}) {
  return {
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_DEPLOYMENT_ID: 'dpl_Authoritative123',
    VERCEL_GIT_COMMIT_SHA: VALID_SHA,
    VERCEL_PROJECT_PRODUCTION_URL: 'data-quality-ai-platform.vercel.app',
    VERCEL_REGION: 'iad1',
    ...overrides,
  }
}

async function attack(name, execute) {
  try {
    await execute()
    scenarios.push({ name, status: 'PASS' })
  } catch (error) {
    scenarios.push({ name, status: 'FAIL', error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

try {
  const root = await fixture()

  await attack('authority-spoof-missing-deployment-id', async () => {
    await assert.rejects(
      buildDeployedArtifactManifest({ root, env: env({ VERCEL_DEPLOYMENT_ID: 'attacker-controlled' }) }),
      /VERCEL_DEPLOYMENT_ID is required/,
    )
  })

  await attack('truncated-source-sha', async () => {
    await assert.rejects(
      buildDeployedArtifactManifest({ root, env: env({ VERCEL_GIT_COMMIT_SHA: VALID_SHA.slice(0, 12) }) }),
      /VERCEL_GIT_COMMIT_SHA must be a 40-character Git SHA/,
    )
  })

  await attack('preview-authority-escalation', async () => {
    const preview = await buildDeployedArtifactManifest({
      root,
      env: env({ VERCEL_ENV: 'preview', VERCEL_DEPLOYMENT_ID: 'dpl_PreviewAuthority' }),
    })
    assert.notEqual(preview.artifactClass, 'PRODUCTION_DEPLOYMENT')
    assert.equal(preview.artifactClass, 'NON_PRODUCTION_DEPLOYMENT')
  })

  await attack('artifact-tamper-after-baseline', async () => {
    const baseline = await hashDeployedArtifact(root)
    await writeFile(join(root, '.next/server/route.js'), 'malicious-replacement')
    const attacked = await hashDeployedArtifact(root)
    assert.notEqual(attacked.artifactDigest, baseline.artifactDigest)
    await writeFile(join(root, '.next/server/route.js'), 'authoritative-route')
  })

  await attack('self-referential-manifest-forgery', async () => {
    const baseline = await hashDeployedArtifact(root)
    await mkdir(join(root, 'public/.well-known'), { recursive: true })
    await writeFile(
      join(root, 'public/.well-known/deployed-artifact-provenance.json'),
      JSON.stringify({ artifactDigest: `sha256:${'0'.repeat(64)}`, artifactClass: 'PRODUCTION_DEPLOYMENT' }),
    )
    const attacked = await hashDeployedArtifact(root)
    assert.equal(attacked.artifactDigest, baseline.artifactDigest)
  })

  await attack('symlink-path-substitution', async () => {
    const linkRoot = await fixture()
    await symlink('../BUILD_ID', join(linkRoot, '.next/server/substitution'))
    await assert.rejects(hashDeployedArtifact(linkRoot), /Symbolic links are not allowed/)
  })

  await attack('secret-environment-extraction', async () => {
    const canary = 'super-sensitive-canary-value-never-serialize'
    const manifest = await buildDeployedArtifactManifest({ root, env: env({ DATABASE_PASSWORD: canary, API_TOKEN: canary }) })
    assert.equal(JSON.stringify(manifest).includes(canary), false)
    assert.equal('DATABASE_PASSWORD' in manifest, false)
    assert.equal('API_TOKEN' in manifest, false)
  })

  console.log(JSON.stringify({
    status: 'PASS',
    auditKind: 'SEPARATE_AUTOMATED_ADVERSARIAL_HARNESS',
    humanThirdPartyAudit: false,
    scenarios,
  }))
} finally {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
}

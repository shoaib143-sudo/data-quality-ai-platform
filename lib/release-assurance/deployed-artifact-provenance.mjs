import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export const DEPLOYED_ARTIFACT_MANIFEST_PATH = 'public/.well-known/deployed-artifact-provenance.json'
export const DEPLOYED_ARTIFACT_SCOPES = [
  '.next/server',
  '.next/static',
  '.next/BUILD_ID',
  'package.json',
  'pnpm-lock.yaml',
  'public',
]

const SHA40 = /^[a-f0-9]{40}$/i
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]+$/

function posixPath(value) {
  return value.split(sep).join('/')
}

async function fileSha256(path) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

async function visit(root, path, excluded, files) {
  const info = await lstat(path)
  const rel = posixPath(relative(root, path))
  if (rel === excluded) return
  if (info.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in deployed artifact digest scope: ${rel}`)
  if (info.isFile()) {
    files.push({ path, rel, bytes: info.size })
    return
  }
  if (!info.isDirectory()) throw new Error(`Unsupported filesystem entry in deployed artifact digest scope: ${rel}`)
  const entries = await readdir(path)
  entries.sort((a, b) => a.localeCompare(b))
  for (const entry of entries) await visit(root, join(path, entry), excluded, files)
}

export async function collectDeployedArtifactFiles(root = process.cwd()) {
  const files = []
  const excluded = posixPath(DEPLOYED_ARTIFACT_MANIFEST_PATH)
  for (const scope of DEPLOYED_ARTIFACT_SCOPES) {
    const path = join(root, scope)
    try {
      await stat(path)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        if (scope === 'public') continue
        throw new Error(`Required deployed artifact digest scope is missing: ${scope}`)
      }
      throw error
    }
    await visit(root, path, excluded, files)
  }
  const unique = new Map(files.map((file) => [file.rel, file]))
  return [...unique.values()].sort((a, b) => a.rel.localeCompare(b.rel))
}

export async function hashDeployedArtifact(root = process.cwd()) {
  const files = await collectDeployedArtifactFiles(root)
  if (!files.length) throw new Error('Deployed artifact digest scope is empty')
  const aggregate = createHash('sha256')
  let bytes = 0
  const entries = []
  for (const file of files) {
    const sha256 = await fileSha256(file.path)
    bytes += file.bytes
    aggregate.update(`${file.rel}\0${sha256}\0${file.bytes}\n`, 'utf8')
    entries.push({ path: file.rel, sha256: `sha256:${sha256}`, bytes: file.bytes })
  }
  return {
    artifactDigest: `sha256:${aggregate.digest('hex')}`,
    artifactFileCount: entries.length,
    artifactBytes: bytes,
    entries,
  }
}

function requireProductionIdentity(env) {
  const deploymentId = env.VERCEL_DEPLOYMENT_ID?.trim() ?? ''
  const sourceCommitSha = env.VERCEL_GIT_COMMIT_SHA?.trim() ?? ''
  const productionUrl = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ?? ''
  if (!DEPLOYMENT_ID.test(deploymentId)) throw new Error('VERCEL_DEPLOYMENT_ID is required for production deployed artifact provenance')
  if (!SHA40.test(sourceCommitSha)) throw new Error('VERCEL_GIT_COMMIT_SHA must be a 40-character Git SHA for production deployed artifact provenance')
  if (!productionUrl) throw new Error('VERCEL_PROJECT_PRODUCTION_URL is required for production deployed artifact provenance')
  return { deploymentId, sourceCommitSha: sourceCommitSha.toLowerCase(), productionUrl }
}

export async function buildDeployedArtifactManifest({ root = process.cwd(), env = process.env, now = new Date() } = {}) {
  const vercel = env.VERCEL === '1'
  if (!vercel) return null
  const environment = (env.VERCEL_ENV || env.VERCEL_TARGET_ENV || '').trim().toLowerCase()
  const isProduction = environment === 'production'
  const deploymentId = env.VERCEL_DEPLOYMENT_ID?.trim() ?? ''
  const sourceCommitSha = env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? ''
  const productionUrl = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ?? ''
  if (isProduction) requireProductionIdentity(env)
  if (!isProduction && (!DEPLOYMENT_ID.test(deploymentId) || !SHA40.test(sourceCommitSha))) {
    throw new Error('Vercel preview deployed artifact provenance requires VERCEL_DEPLOYMENT_ID and VERCEL_GIT_COMMIT_SHA')
  }

  const digest = await hashDeployedArtifact(root)
  return {
    schemaVersion: 1,
    evidenceKind: 'VERCEL_DEPLOYED_ARTIFACT',
    provider: 'vercel',
    artifactClass: isProduction ? 'PRODUCTION_DEPLOYMENT' : 'NON_PRODUCTION_DEPLOYMENT',
    environment: environment || 'unknown',
    builderIdentity: `vercel:${env.VERCEL_REGION?.trim() || 'unknown'}:nextjs`,
    buildId: deploymentId,
    deploymentId,
    sourceCommitSha,
    productionUrl,
    generatedAt: now.toISOString(),
    artifactDigest: digest.artifactDigest,
    artifactFileCount: digest.artifactFileCount,
    artifactBytes: digest.artifactBytes,
    digestAlgorithm: 'sha256',
    digestMethod: 'sorted-path-plus-file-sha256-and-size',
    digestScopes: [...DEPLOYED_ARTIFACT_SCOPES],
    excludedPaths: [DEPLOYED_ARTIFACT_MANIFEST_PATH],
  }
}

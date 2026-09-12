import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  DEPLOYED_ARTIFACT_MANIFEST_PATH,
  buildDeployedArtifactManifest,
} from '../lib/release-assurance/deployed-artifact-provenance.mjs'

async function main() {
  const root = process.cwd()
  const manifest = await buildDeployedArtifactManifest({ root })
  if (!manifest) {
    console.log(JSON.stringify({ status: 'SKIPPED', reason: 'NOT_VERCEL_BUILD' }))
    return
  }

  const target = join(root, DEPLOYED_ARTIFACT_MANIFEST_PATH)
  const directory = dirname(target)
  await mkdir(directory, { recursive: true })
  const temporary = `${target}.tmp-${process.pid}`
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 })
  await rename(temporary, target)

  console.log(JSON.stringify({
    status: 'WRITTEN',
    evidenceKind: manifest.evidenceKind,
    artifactClass: manifest.artifactClass,
    environment: manifest.environment,
    deploymentId: manifest.deploymentId,
    sourceCommitSha: manifest.sourceCommitSha,
    artifactDigest: manifest.artifactDigest,
    artifactFileCount: manifest.artifactFileCount,
    artifactBytes: manifest.artifactBytes,
    manifestPath: `/${DEPLOYED_ARTIFACT_MANIFEST_PATH.replace(/^public\//, '')}`,
  }))
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    error: error instanceof Error ? error.message : String(error),
  }))
  process.exitCode = 1
})

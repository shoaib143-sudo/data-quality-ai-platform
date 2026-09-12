import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex')
const required = (name) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function migrationSetDigest(root = 'supabase/migrations') {
  const names = (await readdir(root)).filter((name) => name.endsWith('.sql')).sort()
  const hash = createHash('sha256')
  for (const name of names) {
    const bytes = await readFile(path.join(root, name))
    hash.update(name)
    hash.update('\0')
    hash.update(createHash('sha256').update(bytes).digest('hex'))
    hash.update('\n')
  }
  return { digest: hash.digest('hex'), count: names.length, latest: names.at(-1) ?? null }
}

async function main() {
  const artifactPath = process.argv[2] ?? 'release-evidence/reference-build.tgz'
  await stat(artifactPath)
  const sourceCommitSha = required('GITHUB_SHA')
  if (!/^[0-9a-f]{40}$/i.test(sourceCommitSha)) throw new Error('GITHUB_SHA must be a full commit SHA')

  const sourceTreeSha = execFileSync('git', ['rev-parse', `${sourceCommitSha}^{tree}`], { encoding: 'utf8' }).trim()
  const migrationSet = await migrationSetDigest()
  const manifest = {
    schemaVersion: 1,
    kind: 'SIGNED_REFERENCE_BUILD',
    productionArtifactEquivalenceClaimed: false,
    repository: required('GITHUB_REPOSITORY'),
    sourceCommitSha,
    sourceTreeSha,
    lockfileSha256: await sha256('pnpm-lock.yaml'),
    migrationSetSha256: migrationSet.digest,
    migrationCount: migrationSet.count,
    latestMigration: migrationSet.latest,
    referenceBuild: {
      path: artifactPath,
      sha256: await sha256(artifactPath),
    },
    workflow: {
      name: required('GITHUB_WORKFLOW'),
      runId: required('GITHUB_RUN_ID'),
      runAttempt: required('GITHUB_RUN_ATTEMPT'),
      ref: required('GITHUB_REF'),
    },
    generatedAt: new Date().toISOString(),
  }

  await mkdir('release-evidence', { recursive: true })
  await writeFile('release-evidence/reference-build-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(JSON.stringify(manifest, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})

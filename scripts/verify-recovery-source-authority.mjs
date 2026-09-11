import { access, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'

const manifest = JSON.parse(await readFile('infra/recovery/platform-manifest.json', 'utf8'))
const config = await readFile('supabase/config.toml', 'utf8')

if (!new RegExp(`project_id\\s*=\\s*["']${manifest.supabase.projectRef}["']`).test(config)) {
  throw new Error('supabase/config.toml project_id must match the recovery platform manifest Supabase projectRef.')
}
console.log('PASS Supabase project identity is consistent across recovery sources')

const requiredFunctions = new Set(manifest.supabase.requiredEdgeFunctions ?? [])
const functionEntries = await readdir('supabase/functions', { withFileTypes: true })
for (const entry of functionEntries) {
  if (!entry.isDirectory() || entry.name.startsWith('_')) continue
  if (!requiredFunctions.has(entry.name)) {
    throw new Error(`Source-controlled Edge Function ${entry.name} is missing from the recovery platform manifest.`)
  }
}

for (const functionName of requiredFunctions) {
  const entrypoint = `supabase/functions/${functionName}/index.ts`
  await access(entrypoint, constants.R_OK)

  const section = `[functions.${functionName}]`
  const sectionIndex = config.indexOf(section)
  if (sectionIndex < 0) throw new Error(`Missing Supabase config.toml section for required Edge Function ${functionName}.`)

  const nextSection = config.indexOf('\n[functions.', sectionIndex + section.length)
  const sectionBody = config.slice(sectionIndex, nextSection < 0 ? config.length : nextSection)
  if (!/verify_jwt\s*=\s*true/.test(sectionBody)) {
    throw new Error(`Required Edge Function ${functionName} must keep JWT verification enabled in source-controlled configuration.`)
  }

  console.log(`PASS source-controlled Edge Function ${functionName}`)
}

await access('supabase/functions/profiling-executor/deno.json', constants.R_OK)
if (!/\[functions\.profiling-executor\][\s\S]*import_map\s*=\s*['"]\.\/functions\/profiling-executor\/deno\.json['"]/.test(config)) {
  throw new Error('Profiling executor import-map authority is missing from supabase/config.toml.')
}
console.log('PASS profiling executor dependency configuration is source controlled')

const aliases = JSON.parse(await readFile('infra/recovery/migration-history-aliases.json', 'utf8'))
if (aliases.schemaVersion !== 1 || aliases.policy !== 'DO_NOT_REWRITE_PRODUCTION_HISTORY') {
  throw new Error('Migration history alias registry must explicitly prohibit rewriting production history.')
}

const migrationFiles = (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql'))
const repositoryVersions = new Set()
const productionVersions = new Set()

for (const alias of aliases.aliases ?? []) {
  const expectedFile = `${alias.repositoryVersion}_${alias.logicalName}.sql`
  if (!/^\d{14}$/.test(alias.repositoryVersion) || !/^\d{14}$/.test(alias.observedProductionVersion)) {
    throw new Error(`Migration alias ${alias.logicalName} must use 14-digit repository and production versions.`)
  }
  if (!migrationFiles.includes(expectedFile)) {
    throw new Error(`Migration alias ${alias.logicalName} does not resolve to repository migration ${expectedFile}.`)
  }
  if (migrationFiles.includes(`${alias.observedProductionVersion}_${alias.logicalName}.sql`)) {
    throw new Error(`Do not duplicate ${alias.logicalName} under its observed production migration version.`)
  }
  if (repositoryVersions.has(alias.repositoryVersion) || productionVersions.has(alias.observedProductionVersion)) {
    throw new Error(`Duplicate migration-history alias version detected for ${alias.logicalName}.`)
  }
  repositoryVersions.add(alias.repositoryVersion)
  productionVersions.add(alias.observedProductionVersion)
  if (!alias.reason || !alias.observedVia) throw new Error(`Migration alias ${alias.logicalName} requires reason and provenance.`)
  console.log(`PASS migration history alias ${alias.logicalName}: repo ${alias.repositoryVersion}, live ${alias.observedProductionVersion}`)
}

const backup = JSON.parse(await readFile('infra/recovery/portable-backup-contract.json', 'utf8'))
if (backup.schemaVersion !== 1 || backup.mechanism !== 'PORTABLE_LOGICAL_EXPORT') {
  throw new Error('Portable backup contract must identify PORTABLE_LOGICAL_EXPORT as its mechanism.')
}
if (backup.targetRpoMinutes !== 60 || backup.rpoCurrentlyProven !== false) {
  throw new Error('Portable backup contract must retain the 60-minute target while truthfully recording that it is not yet proven.')
}
if (backup.security?.plaintextBackupMayBeCommitted !== false || backup.security?.offProviderCopyRequired !== true || backup.security?.encryptionAtRestRequired !== true || backup.security?.integrityHashRequired !== true) {
  throw new Error('Portable backup contract must prohibit committed plaintext and require off-provider encrypted integrity-checked copies.')
}
if (backup.scopeBoundaries?.storageObjectBytes?.toLowerCase().includes('not included') !== true) {
  throw new Error('Portable backup contract must explicitly keep Storage object bytes outside database-backup evidence.')
}
console.log('PASS zero-cost portable backup security and evidence boundaries')

const bia = await readFile('docs/recovery-business-impact-analysis.md', 'utf8')
for (const [pattern, label] of [
  [/target RPO:\s*60 minutes/i, '60-minute RPO objective'],
  [/target RTO:\s*240 minutes/i, '240-minute RTO objective'],
  [/not evidence that the objectives are currently achieved/i, 'objectives versus evidence boundary'],
  [/maximum tolerable disruption[\s\S]*not yet been formally approved/i, 'no fabricated MTD'],
  [/Recovery tooling must never silently downgrade/i, 'fail-closed objective governance'],
]) {
  if (!pattern.test(bia)) throw new Error(`Recovery BIA contract failed: ${label} is missing.`)
  console.log(`PASS Recovery BIA ${label}`)
}

const runbook = await readFile('docs/recovery-assurance-v2.md', 'utf8')
if (!/current Supabase organization is on the Free plan/i.test(runbook)) {
  throw new Error('Recovery runbook must document the current zero-additional-cost Supabase posture.')
}
if (!/no workflow may claim managed PITR, `RESTORED`, or `READY`/i.test(runbook)) {
  throw new Error('Recovery runbook must fail closed on unsupported managed recovery claims.')
}
console.log('PASS zero-cost recovery posture remains explicit and fail closed')

console.log('Recovery source-authority verification completed.')

import fs from 'node:fs'
import path from 'node:path'

const sourceDir = process.env.SOURCE_MIGRATION_DIR || path.join(process.cwd(), 'supabase', 'migrations')
const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(sourceDir)) throw new Error(`SOURCE_MIGRATION_DIR does not exist: ${sourceDir}`)

const files = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.sql')).sort()
const originalVersions = new Set(files.map((name) => name.slice(0, 14)))
const assignedVersions = new Set()
const perVersionIndex = new Map()
const manifest = []

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(targetDir, { recursive: true })

function nextReplayVersion(original) {
  let index = perVersionIndex.get(original) ?? 0
  while (true) {
    const minute = original.slice(0, 12)
    const second = Number(original.slice(12, 14)) + index
    if (second > 59) throw new Error(`Cannot normalize migration collision ${original}: exhausted second slots`)
    const candidate = `${minute}${String(second).padStart(2, '0')}`
    index += 1
    perVersionIndex.set(original, index)
    const reservedByAnotherOriginal = candidate !== original && originalVersions.has(candidate)
    if (!assignedVersions.has(candidate) && !reservedByAnotherOriginal) {
      assignedVersions.add(candidate)
      return candidate
    }
  }
}

// The live estate contains profiling.dataset_execution_sources, but the released
// migration history starts by hardening that table and never records its original
// creation. Keep released migrations immutable and make the historical gap explicit
// only in the disposable clean-replay directory used by V6 certification.
const reconstructionVersion = '20260825235959'
const reconstructionName = `${reconstructionVersion}_reconstruct_dataset_execution_sources.sql`
if (originalVersions.has(reconstructionVersion)) {
  throw new Error(`Clean replay reconstruction version collides with released migration ${reconstructionVersion}`)
}
assignedVersions.add(reconstructionVersion)
const reconstructionSql = `begin;

create table if not exists profiling.dataset_execution_sources (
  id uuid primary key default gen_random_uuid(),
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete cascade,
  source_type text not null,
  source_uri text,
  execution_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dataset_execution_sources_version
  on profiling.dataset_execution_sources(dataset_version_id);

create unique index if not exists dataset_execution_sources_one_active_per_version
  on profiling.dataset_execution_sources(dataset_version_id)
  where active = true;

commit;
`
fs.writeFileSync(path.join(targetDir, reconstructionName), reconstructionSql)
manifest.push({
  source: null,
  replay: reconstructionName,
  normalized: false,
  reconstructed: true,
  reason: 'Released history hardens profiling.dataset_execution_sources before any recorded table creation; reconstruction matches the live table contract.'
})

for (const file of files) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) throw new Error(`Malformed migration filename: ${file}`)
  const originalVersion = file.slice(0, 14)
  const replayVersion = nextReplayVersion(originalVersion)
  const suffix = file.slice(15)
  const targetName = `${replayVersion}_${suffix}`
  const sourcePath = path.join(sourceDir, file)
  const targetPath = path.join(targetDir, targetName)
  fs.copyFileSync(sourcePath, targetPath)

  // The released job-monitor migration predates the canonical project-membership
  // helper and references catalog.project_members, an obsolete table that is not
  // part of the current or foundation schema. Rewrite only the disposable replay
  // copy to the equivalent foundation helper. Released migration evidence remains
  // byte-for-byte immutable.
  if (file === '20260828000000_job_monitor_operations.sql') {
    const originalSql = fs.readFileSync(targetPath, 'utf8')
    const legacyPolicy = `  exists (\n    select 1\n    from agent.agent_runs r\n    join catalog.project_members pm on pm.project_id = r.project_id\n    where r.id = agent_run_logs.agent_run_id\n      and pm.user_id = auth.uid()\n  )`
    const canonicalPolicy = `  exists (\n    select 1\n    from agent.agent_runs r\n    where r.id = agent_run_logs.agent_run_id\n      and app_private.is_project_member(r.project_id)\n  )`
    if (!originalSql.includes(legacyPolicy)) {
      throw new Error('Historical agent_run_logs membership policy no longer matches the audited replay repair contract')
    }
    fs.writeFileSync(targetPath, originalSql.replace(legacyPolicy, canonicalPolicy))
    manifest.push({
      source: file,
      replay: targetName,
      normalized: replayVersion !== originalVersion,
      reconstructed: true,
      reason: 'Disposable replay replaces obsolete catalog.project_members policy lookup with the canonical foundation app_private.is_project_member helper.'
    })
    continue
  }

  manifest.push({ source: file, replay: targetName, normalized: replayVersion !== originalVersion, reconstructed: false })
}

fs.writeFileSync(path.join(targetDir, 'replay-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const normalized = manifest.filter((entry) => entry.normalized)
const reconstructed = manifest.filter((entry) => entry.reconstructed)
console.log(`Prepared ${manifest.length} replay entries; normalized ${normalized.length} legacy colliding files and reconstructed/repaired ${reconstructed.length} historical prerequisites.`)
for (const entry of reconstructed) console.log(`RECONSTRUCTED ${entry.replay}: ${entry.reason}`)
for (const entry of normalized) console.log(`NORMALIZED ${entry.source} -> ${entry.replay}`)

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

function writeReconstruction(version, suffix, sql, reason) {
  if (originalVersions.has(version)) {
    throw new Error(`Clean replay reconstruction version collides with released migration ${version}`)
  }
  if (assignedVersions.has(version)) {
    throw new Error(`Clean replay reconstruction version collides with another replay migration ${version}`)
  }
  assignedVersions.add(version)
  const fileName = `${version}_${suffix}.sql`
  fs.writeFileSync(path.join(targetDir, fileName), sql)
  manifest.push({
    source: null,
    replay: fileName,
    normalized: false,
    reconstructed: true,
    transformed: false,
    reason
  })
}

// Replay-only compatibility transforms repair historical dependencies that no
// longer exist in the canonical schema. Each transform is exact and fail-closed:
// if the released source no longer contains the expected text, replay preparation
// aborts rather than silently mutating an unknown migration.
const replayTransforms = new Map([
  [
    '20260828000000_job_monitor_operations.sql',
    {
      expected: `create policy agent_run_logs_select_member
on agent.agent_run_logs
for select
to authenticated
using (
  exists (
    select 1
    from agent.agent_runs r
    join catalog.project_members pm on pm.project_id = r.project_id
    where r.id = agent_run_logs.agent_run_id
      and pm.user_id = auth.uid()
  )
);`,
      replacement: `-- Replay compatibility: the original policy depended on catalog.project_members,
-- a transient table absent from the canonical estate. Leave RLS deny-by-default
-- until the later canonical membership policy is applied.`,
      reason: 'Omit obsolete catalog.project_members policy dependency while preserving deny-by-default RLS until the canonical membership policy migration.'
    }
  ]
])

// The live estate contains profiling.dataset_execution_sources, but the released
// migration history starts by hardening that table and never records its original
// creation. Keep released migrations immutable and make the historical gap explicit
// only in the disposable clean-replay directory used by V6 certification.
writeReconstruction(
  '20260825235959',
  'reconstruct_dataset_execution_sources',
  `begin;

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
`,
  'Released history hardens profiling.dataset_execution_sources before any recorded table creation; reconstruction matches the live table contract.'
)

// The live estate also contains profiling.data_quality_scores, while released
// history first references it in the quality-score normalization migration. Rebuild
// the missing canonical prerequisite immediately before that normalization so the
// original migration remains immutable and still proves its intended behavior.
writeReconstruction(
  '20260902021959',
  'reconstruct_data_quality_scores',
  `begin;

create table if not exists profiling.data_quality_scores (
  id uuid primary key default gen_random_uuid(),
  profile_run_id uuid not null references profiling.profile_runs(id) on delete cascade,
  completeness_score numeric,
  uniqueness_score numeric,
  validity_score numeric,
  accuracy_score numeric,
  overall_score numeric,
  created_at timestamptz not null default now(),
  constraint profile_quality_scores_unique_run unique (profile_run_id)
);

commit;
`,
  'Released history normalizes profiling.data_quality_scores before any recorded table creation; reconstruction matches the live table contract.'
)

for (const file of files) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) throw new Error(`Malformed migration filename: ${file}`)
  const originalVersion = file.slice(0, 14)
  const replayVersion = nextReplayVersion(originalVersion)
  const suffix = file.slice(15)
  const targetName = `${replayVersion}_${suffix}`
  const sourcePath = path.join(sourceDir, file)
  const targetPath = path.join(targetDir, targetName)
  const transform = replayTransforms.get(file)
  let transformed = false
  let transformReason = null

  if (transform) {
    const originalSql = fs.readFileSync(sourcePath, 'utf8')
    if (!originalSql.includes(transform.expected)) {
      throw new Error(`Replay compatibility transform no longer matches ${file}`)
    }
    const replaySql = originalSql.replace(transform.expected, transform.replacement)
    fs.writeFileSync(targetPath, replaySql)
    transformed = true
    transformReason = transform.reason
  } else {
    fs.copyFileSync(sourcePath, targetPath)
  }

  manifest.push({
    source: file,
    replay: targetName,
    normalized: replayVersion !== originalVersion,
    reconstructed: false,
    transformed,
    reason: transformReason
  })
}

fs.writeFileSync(path.join(targetDir, 'replay-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const normalized = manifest.filter((entry) => entry.normalized)
const reconstructed = manifest.filter((entry) => entry.reconstructed)
const transformed = manifest.filter((entry) => entry.transformed)
console.log(`Prepared ${manifest.length} replay migrations; normalized ${normalized.length} legacy colliding files, reconstructed ${reconstructed.length} historical prerequisites, and transformed ${transformed.length} obsolete dependencies.`)
for (const entry of reconstructed) console.log(`RECONSTRUCTED ${entry.replay}: ${entry.reason}`)
for (const entry of transformed) console.log(`TRANSFORMED ${entry.source} -> ${entry.replay}: ${entry.reason}`)
for (const entry of normalized) console.log(`NORMALIZED ${entry.source} -> ${entry.replay}`)

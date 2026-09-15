import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const version = '20260915065959'
const filename = `${version}_reconstruct_metric_definition_versions.sql`
const target = path.join(targetDir, filename)

if (fs.existsSync(target)) throw new Error(`Replay helper already exists: ${filename}`)

const sql = `
create table if not exists governance.metric_definition_versions (
  id uuid primary key default gen_random_uuid(),
  metric_definition_id uuid not null references profiling.metric_definitions(id) on delete restrict,
  metric_version text not null,
  calculation_method jsonb not null,
  source_attribution jsonb not null default '{}'::jsonb,
  scope_contract jsonb not null default '{}'::jsonb,
  time_window_semantics text not null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  constraint metric_definition_versions_effective_check check (effective_to is null or effective_to > effective_from),
  constraint metric_definition_versions_unique unique (metric_definition_id, metric_version)
);

create index if not exists idx_metric_definition_versions_effective
  on governance.metric_definition_versions (metric_definition_id, effective_from desc);

alter table governance.metric_definition_versions enable row level security;
`

fs.writeFileSync(target, `${sql.trim()}\n`)
console.log(`RECONSTRUCTED ${filename}: production contains governance.metric_definition_versions before released Git history records its creation; disposable replay restores the verified live relation contract for downstream evidence-envelope reconstruction and RLS hardening.`)

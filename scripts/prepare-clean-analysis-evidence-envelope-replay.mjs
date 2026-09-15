import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const version = '20260915070000'
const filename = `${version}_reconstruct_analysis_evidence_envelopes.sql`
const target = path.join(targetDir, filename)

if (fs.existsSync(target)) throw new Error(`Replay helper already exists: ${filename}`)

const sql = `
create table if not exists governance.analysis_evidence_envelopes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  analysis_type text not null,
  metric_definition_version_id uuid references governance.metric_definition_versions(id) on delete restrict,
  analysis_parameters jsonb not null default '{}'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  window_start timestamptz not null,
  window_end timestamptz not null,
  evidence_cutoff_at timestamptz not null,
  source_records jsonb not null default '[]'::jsonb,
  sample_size integer not null default 0 check (sample_size >= 0),
  data_freshness_at timestamptz,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  uncertainty jsonb not null default '{}'::jsonb,
  evidence_lineage jsonb not null default '{}'::jsonb,
  reproducibility_ref text not null,
  algorithm_version text,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint analysis_evidence_envelopes_window_check check (window_start <= window_end),
  constraint analysis_evidence_envelopes_temporal_check check (window_end <= evidence_cutoff_at),
  constraint analysis_evidence_envelopes_freshness_check check (data_freshness_at is null or data_freshness_at <= evidence_cutoff_at)
);

create index if not exists idx_analysis_evidence_envelopes_project_created
  on governance.analysis_evidence_envelopes (project_id, created_at desc);

alter table governance.analysis_evidence_envelopes enable row level security;
`

fs.writeFileSync(target, `${sql.trim()}\n`)
console.log(`RECONSTRUCTED ${filename}: production contains governance.analysis_evidence_envelopes before the repository records its creation; disposable replay restores the live relation contract so later hardening can be replayed.`)

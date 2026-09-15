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
create table if not exists governance.learning_case_assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  learning_case_id uuid not null references agent.agent_learning_cases(id) on delete cascade,
  evidence_cutoff_at timestamptz not null,
  learning_eligible boolean not null default false,
  learning_exclusion_reason text,
  adjudication_state text not null default 'UNADJUDICATED',
  outcome_confidence numeric,
  case_quality_score numeric,
  case_quality_version text not null default 'case-quality-v1',
  quality_factors jsonb not null default '{}'::jsonb,
  last_observed_at timestamptz,
  assessed_at timestamptz not null default now(),
  assessed_by uuid,
  constraint learning_case_assessments_case_unique unique (learning_case_id),
  constraint learning_case_assessments_adjudication_check check (adjudication_state in ('UNADJUDICATED', 'PENDING', 'ADJUDICATED')),
  constraint learning_case_assessments_confidence_check check (outcome_confidence is null or (outcome_confidence >= 0 and outcome_confidence <= 1)),
  constraint learning_case_assessments_quality_check check (case_quality_score is null or (case_quality_score >= 0 and case_quality_score <= 1)),
  constraint learning_case_assessments_cutoff_check check (last_observed_at is null or last_observed_at <= evidence_cutoff_at),
  constraint learning_case_assessments_exclusion_check check (learning_eligible or learning_exclusion_reason is not null)
);

create index if not exists idx_learning_case_assessments_project_eligible
  on governance.learning_case_assessments (project_id, learning_eligible, evidence_cutoff_at desc);

alter table governance.learning_case_assessments enable row level security;

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
  constraint metric_definition_versions_unique unique (metric_definition_id, metric_version),
  constraint metric_definition_versions_effective_check check (effective_to is null or effective_to > effective_from)
);

create index if not exists idx_metric_definition_versions_effective
  on governance.metric_definition_versions (metric_definition_id, effective_from desc);

alter table governance.metric_definition_versions enable row level security;

create table if not exists governance.analysis_evidence_envelopes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  analysis_type text not null,
  metric_definition_version_id uuid references governance.metric_definition_versions(id) on delete restrict,
  analysis_parameters jsonb not null default '{}'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  window_start timestamptz not null,
  window_end timestamptz not null,
  evidence_cutoff_at timestamptz not null,
  source_records jsonb not null default '[]'::jsonb,
  sample_size integer not null default 0,
  data_freshness_at timestamptz,
  confidence numeric,
  uncertainty jsonb not null default '{}'::jsonb,
  evidence_lineage jsonb not null default '{}'::jsonb,
  reproducibility_ref text not null,
  algorithm_version text,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint analysis_evidence_envelopes_window_check check (window_start <= window_end),
  constraint analysis_evidence_envelopes_temporal_check check (window_end <= evidence_cutoff_at),
  constraint analysis_evidence_envelopes_freshness_check check (data_freshness_at is null or data_freshness_at <= evidence_cutoff_at),
  constraint analysis_evidence_envelopes_sample_size_check check (sample_size >= 0),
  constraint analysis_evidence_envelopes_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists idx_analysis_evidence_envelopes_project_created
  on governance.analysis_evidence_envelopes (project_id, created_at desc);

alter table governance.analysis_evidence_envelopes enable row level security;
`

fs.writeFileSync(target, `${sql.trim()}\n`)
console.log(`RECONSTRUCTED ${filename}: released history references the governed analytics foundation before the repository records its creation; disposable replay restores the original 20260915102000 foundation boundary so later hardening migrations retain ownership of their constraints.`)

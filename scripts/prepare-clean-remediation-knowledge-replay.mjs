import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const version = '20260904215140'
const filename = `${version}_reconstruct_remediation_knowledge.sql`
const target = path.join(targetDir, filename)

if (fs.existsSync(target)) throw new Error(`Replay helper already exists: ${filename}`)

const sql = `
create table if not exists governance.remediation_knowledge (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid references catalog.datasets(id) on delete set null,
  issue_id uuid references governance.issues(id) on delete set null,
  knowledge_key text not null,
  problem_type text not null,
  symptom text not null,
  remediation_action text not null,
  outcome_status text not null check (outcome_status in ('WORKED','PARTIAL','FAILED')),
  before_evidence jsonb not null default '{}'::jsonb,
  after_evidence jsonb not null default '{}'::jsonb,
  reusable_guidance text not null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, knowledge_key)
);
`

fs.writeFileSync(target, `${sql.trim()}\n`)
console.log(`RECONSTRUCTED ${filename}: released learning history references governance.remediation_knowledge before its creation is represented; replay restores the live relation contract.`)

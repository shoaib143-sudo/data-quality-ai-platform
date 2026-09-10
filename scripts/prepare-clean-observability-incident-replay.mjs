import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const version = '20260904163430'
const replay = `${version}_reconstruct_observability_incidents.sql`
const targetPath = path.join(targetDir, replay)
const collision = fs.readdirSync(targetDir).some((name) => name.startsWith(`${version}_`))
if (collision) throw new Error(`Observability incident replay version collides with existing migration ${version}`)

const sql = `
create table if not exists governance.observability_incidents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  status text not null default 'OPEN' check (status in ('OPEN','INVESTIGATING','MITIGATING','RESOLVED','ERROR')),
  severity text not null default 'INFO' check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  title text not null,
  summary text not null,
  probable_root_causes jsonb not null default '[]'::jsonb,
  business_impact text,
  risk jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  approval_required boolean not null default false,
  workflow_instance_id uuid references governance.workflow_instances(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  response_due_at timestamptz,
  escalation_level integer not null default 0 check (escalation_level >= 0 and escalation_level <= 5),
  last_escalated_at timestamptz
);
`

fs.writeFileSync(targetPath, sql.trimStart())
console.log(`RECONSTRUCTED ${replay}: released projection history compiles against governance.observability_incidents before its creation is represented; replay restores the live relation contract.`)

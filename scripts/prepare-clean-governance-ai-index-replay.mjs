import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const reconstructionVersion = '20260904232120'
const reconstructionFile = `${reconstructionVersion}_reconstruct_cde_relations.sql`
const reconstructionPath = path.join(targetDir, reconstructionFile)
if (fs.existsSync(reconstructionPath)) throw new Error(`Replay helper already exists: ${reconstructionFile}`)

const reconstructionSql = `
create table if not exists governance.critical_data_elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  cde_key text not null,
  name text not null,
  definition text not null,
  domain text not null,
  criticality text not null default 'HIGH' check (criticality in ('MEDIUM','HIGH','CRITICAL')),
  regulatory_relevance text[] not null default '{}'::text[],
  classification_label_id uuid references governance.classification_labels(id) on delete set null,
  owner_role text,
  steward_role text,
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','RETIRED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, cde_key)
);

create table if not exists governance.cde_mappings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  cde_id uuid not null references governance.critical_data_elements(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  column_name text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'SUGGESTED' check (status in ('SUGGESTED','APPROVED','REJECTED')),
  source text not null default 'KNOWLEDGE_BOOTSTRAP',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  unique (project_id, cde_id, dataset_id, column_name)
);
`
fs.writeFileSync(reconstructionPath, `${reconstructionSql.trim()}\n`)
console.log(`RECONSTRUCTED ${reconstructionFile}: released governance AI index history references canonical CDE relations before their creation is represented; replay restores their live contracts.`)

const candidates = fs.readdirSync(targetDir).filter((name) => name.includes('governance_ai_foreign_key_indexes') && name.endsWith('.sql'))
if (candidates.length !== 1) throw new Error(`Expected exactly one governance AI foreign-key index migration in replay, found ${candidates.length}`)

const migrationPath = path.join(targetDir, candidates[0])
let migration = fs.readFileSync(migrationPath, 'utf8')
const obsoleteRelations = [
  'governance.effective_policy_controls',
  'governance.parent_region_consents',
  'governance.policy_impact_analyses',
  'governance.policy_impact_analysis_controls',
]

let removed = 0
for (const relation of obsoleteRelations) {
  const escaped = relation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const statement = new RegExp(`create\\s+(?:unique\\s+)?index\\s+if\\s+not\\s+exists\\s+[^;]+?\\s+on\\s+${escaped}\\s*\\([^;]+?;`, 'gis')
  migration = migration.replace(statement, () => {
    removed += 1
    return `-- replay-only: omitted obsolete index for ${relation}; relation is absent from the current canonical live schema.`
  })
}

if (removed === 0) throw new Error('No obsolete governance AI index statements were removed; migration shape changed unexpectedly')
fs.writeFileSync(migrationPath, migration)
console.log(`REPAIRED ${candidates[0]}: omitted ${removed} obsolete index statements targeting relations absent from the canonical live schema.`)

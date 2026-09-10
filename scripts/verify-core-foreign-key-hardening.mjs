import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260910185800_cover_remaining_core_foreign_keys.sql', 'utf8')
const statements = migration.match(/create index if not exists/gi) ?? []

const checks = [
  ['all 42 current advisor FK findings are covered', statements.length === 42],
  ['control evaluation control FK covered', /governance\.control_evaluations\(control_id\)/.test(migration)],
  ['control evaluation scope FK covered', /governance\.control_evaluations\(scope_binding_id\)/.test(migration)],
  ['AI assessment project FK covered', /governance\.ai_system_assessments\(project_id\)/.test(migration)],
  ['catalog promotion FKs covered', /catalog\.asset_promotion_requests\(dataset_id\)/.test(migration) && /catalog\.asset_promotion_requests\(discovered_asset_id\)/.test(migration)],
  ['lineage revision FKs covered', /governance\.lineage_assets\(catalog_revision_id\)/.test(migration) && /governance\.lineage_ingestion_events\(catalog_revision_id\)/.test(migration)],
  ['composite job dependency FK covered in FK order', /orchestration\.job_dependencies\(project_id, job_id\)/.test(migration)],
  ['no unique indexes introduced', !/create unique index/i.test(migration)],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) process.exit(1)

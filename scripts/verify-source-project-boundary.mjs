import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260910185000_enforce_dataset_source_project_boundary.sql', 'utf8')
const validation = fs.readFileSync('lib/profiling/source-validation.ts', 'utf8')

const checks = [
  ['cross-project source trigger exists', /create trigger datasets_enforce_source_project_boundary/i.test(migration)],
  ['trigger checks source project', /v_source_project_id\s*<>\s*new\.project_id/i.test(migration)],
  ['migration refuses pre-existing cross-project bindings', /cross-project bindings exist/i.test(migration)],
  ['trigger helper not client executable', /revoke all on function catalog\.enforce_dataset_source_project_boundary\(\) from public, anon, authenticated/i.test(migration)],
  ['application source validation retains project identity', /type DataSource = \{ id: string; project_id: string;/i.test(validation)],
  ['storage file paths remain project scoped', /projects\/\$\{source\.project_id\}\//.test(validation)],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) process.exit(1)

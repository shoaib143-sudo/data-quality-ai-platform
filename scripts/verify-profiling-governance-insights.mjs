import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260910185200_profile_run_governance_insights.sql', 'utf8')
const runtime = fs.readFileSync('lib/profiling/governance-insights.ts', 'utf8')

const checks = [
  ['view is security invoker', /with \(security_invoker = true\)/i.test(migration)],
  ['view derives from canonical profile runs', /from profiling\.profile_runs pr/i.test(migration)],
  ['view joins canonical quality scores', /profiling\.data_quality_scores qs/i.test(migration)],
  ['view aggregates canonical findings', /profiling\.profile_findings pf/i.test(migration)],
  ['view exposes evidence counts, not inferred severity', /count\(\*\) filter \(where upper\(pf\.severity\) = 'HIGH'\)/i.test(migration)],
  ['runtime enforces single-instance project boundary', /assertProjectBelongsToInstanceOrganization\(normalizedProjectId\)/.test(runtime)],
  ['runtime reads canonical insight view', /from\('profile_run_governance_insights'\)/.test(runtime)],
  ['runtime remains project scoped', /\.eq\('project_id', normalizedProjectId\)/.test(runtime)],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) process.exit(1)

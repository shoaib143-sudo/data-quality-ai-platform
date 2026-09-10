import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260910185400_retrieval_benchmark_as_of_authority.sql', 'utf8')
const runtime = fs.readFileSync('lib/ai/governance-retrieval-evaluation-dataset.ts', 'utf8')

const checks = [
  ['as-of function is security invoker', /security invoker/i.test(migration)],
  ['as-of function excludes future case versions', /v\.created_at\s*<=\s*p_as_of/i.test(migration)],
  ['as-of function versions by canonical case key', /distinct on \(v\.case_key\)/i.test(migration)],
  ['runtime accepts explicit asOf', /options: \{ asOf\?: string \| Date \| null \}/.test(runtime)],
  ['runtime calls canonical as-of function', /rpc\('list_ai_retrieval_evaluation_cases_as_of'/.test(runtime)],
  ['judgments remain restricted to returned case versions', /\.in\('case_version_id', caseIds\)/.test(runtime)],
  ['governed import requires source reference', /GOVERNED_IMPORT.*source_reference/s.test(runtime)],
  ['source reference is carried into benchmark evidence', /source:\$\{row\.source_reference\.trim\(\)\}/.test(runtime)],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) process.exit(1)

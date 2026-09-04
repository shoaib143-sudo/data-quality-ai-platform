import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const requiredFiles = [
  'app/api/profiling/approval/route.ts',
  'app/api/profiling/remediation/route.ts',
  'app/api/profiling/remediation/verify/route.ts',
  'app/workflows/page.tsx',
  'app/workflows/workflow-manager.tsx',
  'supabase/migrations/20260904170000_add_profiling_remediation_outcomes.sql',
  'supabase/migrations/20260904170100_index_profiling_remediation_outcomes.sql',
]

for (const path of requiredFiles) {
  await access(path, constants.R_OK)
  console.log(`PASS remediation artifact ${path}`)
}

const checks = [
  ['app/api/profiling/approval/route.ts', /approval_required[\s\S]*PROFILE_RUN[\s\S]*policy\.approve[\s\S]*start_workflow/, 'investigation approval gating'],
  ['app/api/profiling/approval/route.ts', /PROFILING_REMEDIATION_APPROVAL[\s\S]*workflow_definitions/, 'default profiling approval workflow'],
  ['app/api/profiling/remediation/route.ts', /status !== 'APPROVED'[\s\S]*issues\.manage[\s\S]*TRACKED_GOVERNANCE_ISSUES_ONLY[\s\S]*production_mutation_performed:\s*false/, 'approved non-destructive remediation execution'],
  ['app/api/profiling/remediation/route.ts', /profiling_remediation_outcomes[\s\S]*ACTION_TRACKED/, 'remediation outcome persistence'],
  ['app/api/profiling/remediation/verify/route.ts', /VERIFICATION_PROFILE_PENDING[\s\S]*completed_at[\s\S]*quality_not_worse[\s\S]*high_severity_findings_not_worse/, 'automatic evidence-based verification'],
  ['app/api/profiling/remediation/verify/route.ts', /profiling_remediation_outcomes[\s\S]*VERIFIED[\s\S]*VERIFICATION_FAILED[\s\S]*recommendation_effective/, 'verification effectiveness persistence'],
  ['app/workflows/workflow-manager.tsx', /Track remediation[\s\S]*Verify latest profile/, 'workflow remediation controls'],
  ['app/workflows/workflow-manager.tsx', /quality_score_delta[\s\S]*high_severity_findings_delta/, 'workflow verification outcome evidence'],
  ['supabase/migrations/20260904170000_add_profiling_remediation_outcomes.sql', /unique\(workflow_instance_id\)/, 'remediation outcome workflow idempotency'],
  ['supabase/migrations/20260904170000_add_profiling_remediation_outcomes.sql', /enable row level security[\s\S]*is_project_member/, 'project-scoped remediation outcome RLS'],
  ['supabase/migrations/20260904170100_index_profiling_remediation_outcomes.sql', /verification_profile_run_id[\s\S]*created_by/, 'remediation outcome foreign-key indexes'],
]

for (const [path, pattern, label] of checks) {
  const content = await readFile(path, 'utf8')
  if (!pattern.test(content)) throw new Error(`Profiling remediation contract failed: ${label} is missing from ${path}`)
  console.log(`PASS remediation contract ${label}`)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (url && serviceRoleKey) {
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { count, error } = await supabase
    .schema('governance')
    .from('profiling_remediation_outcomes')
    .select('id', { count: 'exact', head: true })
  if (error) throw new Error(`Live profiling remediation outcome registry is unavailable: ${error.message}`)
  console.log(`PASS live remediation outcome registry -> ${count ?? 0} recorded outcomes`)
}

console.log('Profiling remediation verification completed.')

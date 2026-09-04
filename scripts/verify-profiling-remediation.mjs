import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const requiredFiles = [
  'app/api/profiling/approval/route.ts',
  'app/api/profiling/remediation/route.ts',
  'app/api/profiling/remediation/reprofile/route.ts',
  'app/api/profiling/remediation/verify/route.ts',
  'lib/agents/run-profiling-job.ts',
  'lib/orchestration/worker.ts',
  'lib/profiling/remediation-verification.ts',
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
  ['app/api/profiling/remediation/route.ts', /existingOutcome[\s\S]*reusedOutcome:\s*true[\s\S]*learningEvidenceRepaired/, 'idempotent self-healing remediation execution'],
  ['app/api/profiling/remediation/route.ts', /profiling_remediation_outcomes[\s\S]*ACTION_TRACKED/, 'remediation outcome persistence'],
  ['app/api/profiling/remediation/reprofile/route.ts', /workflowInstanceId[\s\S]*issues\.manage[\s\S]*remediation_issue_ids/, 'authorized workflow-keyed automatic verification retry'],
  ['app/api/profiling/remediation/reprofile/route.ts', /job_queue[\s\S]*DEAD[\s\S]*SUCCEEDED[\s\S]*verification_retryable/, 'linked exhausted verification job recovery'],
  ['app/api/profiling/remediation/reprofile/route.ts', /status:\s*'QUEUED'[\s\S]*attempts:\s*0[\s\S]*MANUAL_RETRY_QUEUED/, 'linked verification job requeue reset'],
  ['app/api/profiling/remediation/reprofile/route.ts', /PROFILING_REMEDIATION_REPROFILE_RETRY_QUEUED/, 'verification retry audit evidence'],
  ['app/api/profiling/remediation/reprofile/route.ts', /WAITING_FOR_REMEDIATION[\s\S]*QUEUED[\s\S]*ALREADY_QUEUED/, 'automatic verification retry lifecycle responses'],
  ['app/api/profiling/remediation/verify/route.ts', /REMEDIATION_IN_PROGRESS[\s\S]*VERIFICATION_PROFILE_PENDING[\s\S]*VERIFICATION_PROFILE_RUNNING[\s\S]*verifyRemediationOutcome/, 'linked automatic verification routing'],
  ['lib/agents/run-profiling-job.ts', /startOrRetryStep[\s\S]*step_order[\s\S]*attempt:\s*Number\(existing\.attempt \?\? 1\) \+ 1/, 'profiling step retry idempotency'],
  ['lib/orchestration/worker.ts', /recordAutomaticVerificationError[\s\S]*status:\s*'VERIFICATION_QUEUED'[\s\S]*verification_retryable:\s*true/, 'technical verification failure remains retryable'],
  ['lib/orchestration/worker.ts', /completedRun\.status !== 'COMPLETED'[\s\S]*throw technicalError/, 'persisted profiling failure reaches durable retry queue'],
  ['lib/profiling/remediation-verification.ts', /quality_not_worse[\s\S]*high_severity_findings_not_worse[\s\S]*tracked_remediation_issues_resolved/, 'evidence-based verification checks'],
  ['lib/profiling/remediation-verification.ts', /trackedIssueIds[\s\S]*missingTrackedIssues/, 'verification uses exact persisted remediation issue set'],
  ['lib/profiling/remediation-verification.ts', /profiling_remediation_outcomes[\s\S]*VERIFIED[\s\S]*VERIFICATION_FAILED[\s\S]*recommendation_effective/, 'terminal verification effectiveness persistence'],
  ['app/workflows/page.tsx', /remediationIssueIds[\s\S]*remediation_issue_ids[\s\S]*issueChunks[\s\S]*from\('issues'\)[\s\S]*\.in\('id',ids\)/, 'workflow page loads exact persisted remediation issue ids'],
  ['app/workflows/page.tsx', /Math\.ceil\(remediationIssueIds\.length\/100\)/, 'workflow remediation issue lookup is bounded into chunks'],
  ['app/workflows/workflow-manager.tsx', /Track remediation/, 'workflow track remediation control'],
  ['app/workflows/workflow-manager.tsx', /Resolve with evidence/, 'workflow evidence resolution control'],
  ['app/workflows/workflow-manager.tsx', /Check verification/, 'workflow verification status control'],
  ['app/workflows/workflow-manager.tsx', /\/api\/profiling\/remediation\/reprofile/, 'workflow automatic verification retry endpoint'],
  ['app/workflows/workflow-manager.tsx', /verificationRetryable[\s\S]*canRetryAutomaticVerification[\s\S]*Retry automatic verification/, 'workflow retry supports retryable technical failures'],
  ['app/workflows/workflow-manager.tsx', /Automatic verification needs retry/, 'workflow surfaces retryable verification state'],
  ['app/workflows/workflow-manager.tsx', /resolutionSummary[\s\S]*resolutionEvidence[\s\S]*GOVERNANCE_WORKFLOW_UI/, 'workflow resolution evidence capture'],
  ['app/workflows/workflow-manager.tsx', /Automatic verification queued/, 'workflow automatic verification queue message'],
  ['app/workflows/workflow-manager.tsx', /verification_job_id/, 'workflow automatic verification job evidence'],
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

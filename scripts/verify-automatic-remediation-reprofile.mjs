import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const requiredFiles = [
  'lib/profiling/remediation-reprofile.ts',
  'lib/profiling/remediation-verification.ts',
  'lib/orchestration/worker.ts',
  'app/api/issues/[issueId]/route.ts',
  'app/api/profiling/remediation/verify/route.ts',
  'supabase/migrations/20260904170400_automatic_remediation_reprofile.sql',
]

for (const path of requiredFiles) {
  await access(path, constants.R_OK)
  console.log(`PASS automatic reprofile artifact ${path}`)
}

const checks = [
  ['supabase/migrations/20260904170400_automatic_remediation_reprofile.sql', /VERIFICATION_QUEUED/, 'verification queued lifecycle state'],
  ['supabase/migrations/20260904170400_automatic_remediation_reprofile.sql', /claim_profiling_remediation_verification[\s\S]*verification_profile_run_id is null[\s\S]*15 minutes/, 'atomic stale-recoverable verification claim'],
  ['supabase/migrations/20260904170400_automatic_remediation_reprofile.sql', /verification_agent_run_id[\s\S]*verification_job_id[\s\S]*verification_requested_at/, 'verification execution linkage schema'],
  ['lib/profiling/remediation-reprofile.ts', /WAITING_FOR_REMEDIATION[\s\S]*RESOLVED[\s\S]*CLOSED/, 'all remediation issues must resolve before reprofile'],
  ['lib/profiling/remediation-reprofile.ts', /profiling_agent[\s\S]*2\.0[\s\S]*enqueueDurableJob[\s\S]*PROFILING/, 'existing profiling durable job path reuse'],
  ['lib/profiling/remediation-reprofile.ts', /profiling:remediation-verification:[\s\S]*verification_profile_run_id[\s\S]*verification_job_id/, 'idempotent explicit verification linkage'],
  ['app/api/issues/[issueId]/route.ts', /issues\.manage[\s\S]*scheduleRemediationVerificationFromIssue/, 'issue resolution triggers governed verification scheduling'],
  ['lib/orchestration/worker.ts', /PROFILING_REMEDIATION_VERIFICATION[\s\S]*verifyRemediationOutcome[\s\S]*AUTOMATIC_WORKER/, 'durable worker automatically finalizes verification'],
  ['lib/orchestration/worker.ts', /recordAutomaticVerificationError[\s\S]*VERIFICATION_FAILED/, 'automatic verification technical failure persistence'],
  ['app/api/profiling/remediation/verify/route.ts', /verification_profile_run_id[\s\S]*API_LINKED[\s\S]*VERIFICATION_PROFILE_RUNNING/, 'API prefers linked automatic verification evidence'],
]

for (const [path, pattern, label] of checks) {
  const content = await readFile(path, 'utf8')
  if (!pattern.test(content)) throw new Error(`Automatic remediation reprofile contract failed: ${label} is missing from ${path}`)
  console.log(`PASS automatic reprofile contract ${label}`)
}

console.log('Automatic remediation reprofile verification completed.')

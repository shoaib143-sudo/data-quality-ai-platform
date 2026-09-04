import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const requiredFiles = [
  'lib/agents/run-profiling-job.ts',
  'lib/profiling/remediation-reprofile.ts',
  'lib/profiling/remediation-verification.ts',
  'lib/orchestration/worker.ts',
  'app/api/issues/[issueId]/route.ts',
  'app/api/profiling/remediation/reprofile/route.ts',
  'app/api/profiling/remediation/verify/route.ts',
  'app/workflows/page.tsx',
  'app/workflows/workflow-manager.tsx',
  'supabase/migrations/20260904170400_automatic_remediation_reprofile.sql',
  'supabase/migrations/20260904170500_resume_automatic_remediation_reprofile_claim.sql',
  'supabase/migrations/20260904170600_synthetic_profiling_remediation_state_machine_suite.sql',
]

for (const path of requiredFiles) {
  await access(path, constants.R_OK)
  console.log(`PASS automatic reprofile artifact ${path}`)
}

const checks = [
  ['supabase/migrations/20260904170400_automatic_remediation_reprofile.sql', /VERIFICATION_QUEUED/, 'verification queued lifecycle state'],
  ['supabase/migrations/20260904170400_automatic_remediation_reprofile.sql', /verification_agent_run_id[\s\S]*verification_job_id[\s\S]*verification_requested_at/, 'verification execution linkage schema'],
  ['supabase/migrations/20260904170500_resume_automatic_remediation_reprofile_claim.sql', /claim_profiling_remediation_verification[\s\S]*verification_job_id is null[\s\S]*15 minutes/, 'atomic stale-recoverable resumable verification claim'],
  ['supabase/migrations/20260904170600_synthetic_profiling_remediation_state_machine_suite.sql', /run_synthetic_profiling_remediation_state_machine_suite/, 'service-side synthetic remediation state machine suite'],
  ['supabase/migrations/20260904170600_synthetic_profiling_remediation_state_machine_suite.sql', /initial_claim[\s\S]*immediate_duplicate_blocked[\s\S]*stale_unlinked_claim_recovered[\s\S]*linked_job_blocks_reclaim/, 'synthetic claim and idempotency lifecycle checks'],
  ['supabase/migrations/20260904170600_synthetic_profiling_remediation_state_machine_suite.sql', /delete from app\.organizations[\s\S]*synthetic_cleanup/, 'synthetic remediation estate cleanup'],
  ['supabase/migrations/20260904170600_synthetic_profiling_remediation_state_machine_suite.sql', /revoke all on function governance\.run_synthetic_profiling_remediation_state_machine_suite\(\) from authenticated[\s\S]*grant execute[\s\S]*service_role/, 'synthetic suite service-role execution boundary'],
  ['lib/profiling/remediation-reprofile.ts', /WAITING_FOR_REMEDIATION[\s\S]*RESOLVED[\s\S]*CLOSED/, 'all remediation issues must resolve before reprofile'],
  ['lib/profiling/remediation-reprofile.ts', /missingIssueIds[\s\S]*WAITING_FOR_REMEDIATION/, 'missing tracked remediation issue blocks reprofile'],
  ['lib/profiling/remediation-reprofile.ts', /profiling_agent[\s\S]*2\.0[\s\S]*enqueueDurableJob[\s\S]*PROFILING/, 'existing profiling durable job path reuse'],
  ['lib/profiling/remediation-reprofile.ts', /verification_profile_run_id:\s*profilingRunId[\s\S]*verification_agent_run_id:\s*agentRunId[\s\S]*PROFILE_PREPARED[\s\S]*enqueueDurableJob/, 'profile and agent linkage persisted before queue handoff'],
  ['lib/profiling/remediation-reprofile.ts', /profiling:remediation-verification:[\s\S]*verification_job_id:\s*durableJob\.id[\s\S]*JOB_ENQUEUED/, 'idempotent durable job linkage'],
  ['lib/profiling/remediation-reprofile.ts', /jobEnqueued[\s\S]*JOB_ENQUEUED_LINKAGE_PENDING[\s\S]*REPROFILE_LINKAGE_FAILED/, 'enqueued job survives linkage persistence failure'],
  ['lib/agents/run-profiling-job.ts', /startOrRetryStep[\s\S]*agent_run_steps[\s\S]*step_order[\s\S]*attempt:\s*Number\(existing\.attempt \?\? 1\) \+ 1/, 'profiling retries reuse ordered step rows and increment attempts'],
  ['lib/agents/run-profiling-job.ts', /output:\s*null[\s\S]*completed_at:\s*null[\s\S]*error_code:\s*null[\s\S]*error_message:\s*null/, 'profiling step retries clear stale execution state'],
  ['app/api/issues/[issueId]/route.ts', /REMEDIATION_RESOLUTION_EVIDENCE_REQUIRED[\s\S]*scheduleRemediationVerificationFromIssue/, 'server-side remediation evidence requirement before scheduling'],
  ['app/api/issues/[issueId]/route.ts', /issues\.manage[\s\S]*profiling_remediation_outcomes[\s\S]*remediation_issue_ids/, 'issue resolution verifies persisted remediation membership'],
  ['app/api/profiling/remediation/reprofile/route.ts', /workflowInstanceId[\s\S]*issues\.manage[\s\S]*remediation_issue_ids/, 'authorized workflow-keyed reprofile retry'],
  ['app/api/profiling/remediation/reprofile/route.ts', /job_queue[\s\S]*DEAD[\s\S]*SUCCEEDED[\s\S]*verification_retryable/, 'linked exhausted or retryable verification job recovery'],
  ['app/api/profiling/remediation/reprofile/route.ts', /status:\s*'QUEUED'[\s\S]*attempts:\s*0[\s\S]*MANUAL_RETRY_QUEUED[\s\S]*PROFILING_REMEDIATION_REPROFILE_RETRY_QUEUED/, 'linked verification job is requeued in place with audit evidence'],
  ['app/api/profiling/remediation/reprofile/route.ts', /WAITING_FOR_REMEDIATION[\s\S]*QUEUED[\s\S]*ALREADY_QUEUED/, 'retry endpoint preserves remediation verification states'],
  ['lib/orchestration/worker.ts', /recordAutomaticVerificationError[\s\S]*status:\s*'VERIFICATION_QUEUED'[\s\S]*verification_retryable:\s*true/, 'automatic verification technical failures remain retryable'],
  ['lib/orchestration/worker.ts', /prepareProfilingAttempt[\s\S]*profileRun\.status === 'FAILED'[\s\S]*status:\s*'RUNNING'[\s\S]*status:\s*'QUEUED'/, 'durable profiling retry restores failed profile and agent state'],
  ['lib/orchestration/worker.ts', /completedRun\.status !== 'COMPLETED'[\s\S]*recordAutomaticVerificationError[\s\S]*throw technicalError/, 'persisted profiling failure propagates to durable queue retry'],
  ['lib/orchestration/worker.ts', /verifyRemediationOutcome[\s\S]*AUTOMATIC_WORKER[\s\S]*recordAutomaticVerificationError[\s\S]*throw verificationError/, 'verification evaluator errors propagate to durable queue retry'],
  ['lib/profiling/remediation-verification.ts', /remediation_issue_ids[\s\S]*trackedIssueIds[\s\S]*missingTrackedIssues/, 'verification evaluates exact persisted remediation issues'],
  ['lib/profiling/remediation-verification.ts', /VERIFIED[\s\S]*VERIFICATION_FAILED[\s\S]*recommendationEffective/, 'terminal verification states are evidence-evaluation outcomes only'],
  ['app/api/profiling/remediation/verify/route.ts', /REMEDIATION_IN_PROGRESS/, 'API blocks verification while remediation is still tracked'],
  ['app/api/profiling/remediation/verify/route.ts', /VERIFICATION_QUEUE_PENDING/, 'API reports automatic verification preparation'],
  ['app/api/profiling/remediation/verify/route.ts', /verification_profile_run_id/, 'API resolves linked automatic verification run'],
  ['app/api/profiling/remediation/verify/route.ts', /API_LINKED/, 'API records linked verification evidence source'],
  ['app/api/profiling/remediation/verify/route.ts', /VERIFICATION_PROFILE_RUNNING/, 'API reports linked verification run in progress'],
  ['app/workflows/page.tsx', /remediationIssueIds[\s\S]*remediation_issue_ids[\s\S]*issueChunks[\s\S]*from\('issues'\)[\s\S]*\.in\('id',ids\)/, 'workflow page resolves remediation issues from persisted registry ids'],
  ['app/workflows/page.tsx', /Math\.ceil\(remediationIssueIds\.length\/100\)/, 'workflow remediation registry lookup is chunk bounded'],
  ['app/workflows/workflow-manager.tsx', /verificationRetryable[\s\S]*canRetryAutomaticVerification[\s\S]*Retry automatic verification/, 'workflow exposes retry for retryable technical verification failures'],
  ['app/workflows/workflow-manager.tsx', /Automatic verification needs retry/, 'workflow distinguishes retryable technical failure from queued verification'],
  ['app/workflows/workflow-manager.tsx', /\/api\/profiling\/remediation\/reprofile/, 'workflow retry invokes governed reprofile endpoint'],
  ['app/workflows/workflow-manager.tsx', /resolutionSummary[\s\S]*resolutionEvidence[\s\S]*GOVERNANCE_WORKFLOW_UI/, 'workflow UI records resolution evidence'],
  ['app/workflows/workflow-manager.tsx', /Resolve with evidence/, 'workflow UI exposes evidence-driven resolution control'],
  ['app/workflows/workflow-manager.tsx', /Automatic verification queued/, 'workflow UI surfaces automatic verification queue state'],
  ['app/workflows/workflow-manager.tsx', /verification_job_id/, 'workflow UI surfaces automatic verification job linkage'],
]

for (const [path, pattern, label] of checks) {
  const content = await readFile(path, 'utf8')
  if (!pattern.test(content)) throw new Error(`Automatic remediation reprofile contract failed: ${label} is missing from ${path}`)
  console.log(`PASS automatic reprofile contract ${label}`)
}

console.log('Automatic remediation reprofile verification completed.')

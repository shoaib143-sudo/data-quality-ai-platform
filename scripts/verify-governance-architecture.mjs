import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const requiredFiles = [
  'lib/auth/authorize.ts',
  'lib/orchestration/queue.ts',
  'lib/orchestration/outbox.ts',
  'lib/profiling/sampling.ts',
  'lib/profiling/file-source-adapter.ts',
  'lib/identity/scim.ts',
  'app/api/health/live/route.ts',
  'app/api/health/ready/route.ts',
  'app/api/scim/v2/Users/route.ts',
  'app/api/scim/v2/Users/[userId]/route.ts',
  'app/api/lineage/ingest/route.ts',
  'app/api/scorecards/[projectId]/route.ts',
  'app/contracts/page.tsx',
  'app/workflows/page.tsx',
  'app/catalog/discovery/page.tsx',
  'app/data-quality/exceptions/page.tsx',
  'app/search/page.tsx',
  'app/scorecards/page.tsx',
  'app/admin/identity/page.tsx',
  'supabase/migrations/20260904040000_enterprise_governance_hardening_foundation.sql',
  'supabase/migrations/20260904041000_enterprise_governance_contracts_events_workflows.sql',
  'supabase/migrations/20260904042000_discovery_jobs_outbox_recovery_and_waivers.sql',
  'supabase/migrations/20260904044000_immutable_hash_chained_governance_audit.sql',
  'supabase/migrations/20260904050000_enforce_project_capacity_during_job_claim.sql',
  'supabase/migrations/20260904051000_automated_platform_contract_checks.sql',
  'supabase/migrations/20260904052000_operational_recovery_targets_and_drill_gates.sql',
  'supabase/migrations/20260904053000_enterprise_identity_lineage_scorecards_and_indexes.sql',
]

for (const path of requiredFiles) {
  await access(path, constants.R_OK)
  console.log(`PASS required artifact ${path}`)
}

const checks = [
  ['lib/auth/authorize.ts', /authorizeProject[\s\S]*has_project_capability/, 'central authorization'],
  ['lib/orchestration/queue.ts', /idempotency_key[\s\S]*capacity/i, 'durable idempotency and capacity'],
  ['lib/orchestration/outbox.ts', /claimOutboxEvents[\s\S]*processOutboxEvents/, 'transactional outbox consumer'],
  ['lib/profiling/sampling.ts', /FULL[\s\S]*FIXED[\s\S]*PERCENT/, 'configurable sampling modes'],
  ['lib/profiling/file-source-adapter.ts', /extractUnstructuredDocumentText[\s\S]*extractPdfText[\s\S]*extractOfficeZipText/, 'PDF and Office document text extraction'],
  ['lib/identity/scim.ts', /sha256[\s\S]*Bearer/i, 'hashed SCIM bearer tokens'],
  ['app/login/page.tsx', /signInWithSSO/, 'SAML SSO client flow'],
  ['app/auth/callback/route.ts', /exchangeCodeForSession[\s\S]*sso_domains/, 'SSO callback and tenant mapping'],
  ['app/api/lineage/ingest/route.ts', /externalEventId[\s\S]*TRANSFORMS_TO/, 'idempotent external lineage ingestion'],
  ['app/api/health/ready/route.ts', /components\.database[\s\S]*components\.queue[\s\S]*governance_contracts/, 'component readiness checks'],
  ['supabase/migrations/20260904041000_enterprise_governance_contracts_events_workflows.sql', /evaluate_data_contract[\s\S]*invalidate_dataset_certification[\s\S]*start_workflow/, 'contracts, invalidation and workflow engine'],
  ['supabase/migrations/20260904051000_automated_platform_contract_checks.sql', /run_platform_contract_checks/, 'database integration contract checks'],
  ['supabase/migrations/20260904052000_operational_recovery_targets_and_drill_gates.sql', /recovery_policies[\s\S]*backup_restore_drills/, 'recovery targets and drill gates'],
  ['supabase/migrations/20260904053000_enterprise_identity_lineage_scorecards_and_indexes.sql', /project_scorecard_snapshots[\s\S]*refresh_project_scorecard/, 'evidence governance scorecards'],
]

for (const [path, pattern, label] of checks) {
  const content = await readFile(path, 'utf8')
  if (!pattern.test(content)) throw new Error(`Governance architecture contract failed: ${label} is missing from ${path}`)
  console.log(`PASS ${label}`)
}

const profilingRoute = await readFile('app/api/agents/run/route.ts', 'utf8')
if (!/Idempotency-Key|idempotencyKey/.test(profilingRoute) || !/authorizeDatasetVersion/.test(profilingRoute)) throw new Error('Profiling start route must remain centrally authorized and idempotent.')
const qualityRoute = await readFile('app/api/data-quality/run/route.ts', 'utf8')
if (!/authorizeDatasetVersion/.test(qualityRoute) || !/idempotency/i.test(qualityRoute)) throw new Error('Data quality start route must remain centrally authorized and idempotent.')

console.log('Governance architecture verification completed.')

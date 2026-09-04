import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const requiredFiles = [
  'lib/auth/authorize.ts',
  'lib/orchestration/queue.ts',
  'lib/orchestration/outbox.ts',
  'lib/profiling/sampling.ts',
  'lib/profiling/file-source-adapter.ts',
  'lib/identity/scim.ts',
  'lib/governance/semantic-search.ts',
  'lib/governance/semantic-indexer.ts',
  'services/embedding-service/app.py',
  'services/embedding-service/Dockerfile',
  'scripts/recovery-drill.mjs',
  'app/api/health/live/route.ts',
  'app/api/health/ready/route.ts',
  'app/api/scim/v2/Users/route.ts',
  'app/api/scim/v2/Users/[userId]/route.ts',
  'app/api/lineage/ingest/route.ts',
  'app/api/search/semantic/route.ts',
  'app/api/search/semantic/reindex/route.ts',
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
  'supabase/migrations/20260904055500_synthetic_governance_integration_suite.sql',
  'supabase/migrations/20260904055600_fix_synthetic_governance_integration_profile_contract.sql',
  'supabase/migrations/20260904055800_preserve_immutable_audit_references.sql',
  'supabase/migrations/20260904055900_preserve_immutable_revision_references.sql',
  'supabase/migrations/20260904060000_expose_governance_orchestration_api_schemas.sql',
  'supabase/migrations/20260904060100_verify_database_api_security_posture.sql',
  'supabase/migrations/20260904060200_normalize_database_api_security_posture_schema_list.sql',
  'supabase/migrations/20260904104500_governance_semantic_embeddings.sql',
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
  ['lib/governance/semantic-search.ts', /EMBEDDING_DIMENSIONS\s*=\s*384[\s\S]*match_semantic_embeddings[\s\S]*indexSemanticObject/, 'provider-neutral semantic search and indexing'],
  ['lib/governance/semantic-indexer.ts', /DATASET[\s\S]*GLOSSARY_TERM[\s\S]*POLICY[\s\S]*LINEAGE_TRANSFORMATION/, 'governance semantic indexing coverage'],
  ['services/embedding-service/app.py', /all-MiniLM-L6-v2[\s\S]*normalize_embeddings=True[\s\S]*384/, 'free local 384-dimension embedding service'],
  ['app/login/page.tsx', /signInWithSSO/, 'SAML SSO client flow'],
  ['app/auth/callback/route.ts', /exchangeCodeForSession[\s\S]*sso_domains/, 'SSO callback and tenant mapping'],
  ['app/api/lineage/ingest/route.ts', /externalEventId[\s\S]*TRANSFORMS_TO/, 'idempotent external lineage ingestion'],
  ['app/api/search/semantic/route.ts', /semanticSearch[\s\S]*projectId[\s\S]*SEMANTIC_EMBEDDING_PROVIDER_NOT_CONFIGURED/, 'project-scoped semantic search endpoint'],
  ['app/api/search/semantic/reindex/route.ts', /catalog\.update[\s\S]*reindexProjectSemanticObjects/, 'authorized semantic reindex endpoint'],
  ['app/api/health/ready/route.ts', /components\.database[\s\S]*components\.queue[\s\S]*governance_contracts/, 'component readiness checks'],
  ['supabase/migrations/20260904041000_enterprise_governance_contracts_events_workflows.sql', /evaluate_data_contract[\s\S]*invalidate_dataset_certification[\s\S]*start_workflow/, 'contracts, invalidation and workflow engine'],
  ['supabase/migrations/20260904051000_automated_platform_contract_checks.sql', /run_platform_contract_checks/, 'database integration contract checks'],
  ['supabase/migrations/20260904052000_operational_recovery_targets_and_drill_gates.sql', /recovery_policies[\s\S]*backup_restore_drills/, 'recovery targets and drill gates'],
  ['supabase/migrations/20260904053000_enterprise_identity_lineage_scorecards_and_indexes.sql', /project_scorecard_snapshots[\s\S]*refresh_project_scorecard/, 'evidence governance scorecards'],
  ['supabase/migrations/20260904055500_synthetic_governance_integration_suite.sql', /run_synthetic_governance_integration_suite[\s\S]*integration_test_runs/, 'synthetic cross-module governance integration suite'],
  ['supabase/migrations/20260904055800_preserve_immutable_audit_references.sql', /drop constraint[\s\S]*audit_events_project_id_fkey[\s\S]*historical project identifier/i, 'immutable audit reference preservation'],
  ['supabase/migrations/20260904055900_preserve_immutable_revision_references.sql', /drop constraint[\s\S]*object_revisions_project_id_fkey[\s\S]*revision history/i, 'immutable revision reference preservation'],
  ['supabase/migrations/20260904060000_expose_governance_orchestration_api_schemas.sql', /governance, orchestration[\s\S]*reload config/, 'PostgREST governance and orchestration exposure'],
  ['supabase/migrations/20260904060200_normalize_database_api_security_posture_schema_list.sql', /app_private_exposed[\s\S]*exposed_privileged_function_count/, 'database API security posture verification'],
  ['supabase/migrations/20260904104500_governance_semantic_embeddings.sql', /create extension if not exists vector[\s\S]*using hnsw[\s\S]*match_semantic_embeddings/, 'pgvector semantic registry and HNSW similarity RPC'],
]

for (const [path, pattern, label] of checks) {
  const content = await readFile(path, 'utf8')
  if (!pattern.test(content)) throw new Error(`Governance architecture contract failed: ${label} is missing from ${path}`)
  console.log(`PASS ${label}`)
}

const recoveryDrill = await readFile('scripts/recovery-drill.mjs', 'utf8')
const recoverySafeguards = [
  [/ALLOW_RECOVERY_TARGET/, 'explicit destructive target confirmation'],
  [/fingerprint\(source\)\s*===\s*fingerprint\(recovery\)/, 'source and recovery database separation'],
  [/production.*environment|includes\('prod'\)|includes\('production'\)/i, 'production target rejection'],
  [/pg_dump/, 'logical backup creation'],
  [/pg_restore/, 'isolated restore execution'],
  [/vectorExtension/, 'pgvector recovery validation'],
  [/catalogDatasets[\s\S]*profileRuns[\s\S]*governanceTables/, 'critical restored data validation'],
]
for (const [pattern, label] of recoverySafeguards) {
  if (!pattern.test(recoveryDrill)) throw new Error(`Recovery drill safeguard contract failed: ${label} is missing.`)
  console.log(`PASS recovery safeguard ${label}`)
}

const profilingRoute = await readFile('app/api/agents/run/route.ts', 'utf8')
if (!/Idempotency-Key|idempotencyKey/.test(profilingRoute) || !/authorizeDatasetVersion/.test(profilingRoute)) throw new Error('Profiling start route must remain centrally authorized and idempotent.')
const qualityRoute = await readFile('app/api/data-quality/run/route.ts', 'utf8')
if (!/authorizeDatasetVersion/.test(qualityRoute) || !/idempotency/i.test(qualityRoute)) throw new Error('Data quality start route must remain centrally authorized and idempotent.')
const databaseVerification = await readFile('scripts/verify-governance-database.mjs', 'utf8')
if (!/run_synthetic_governance_integration_suite/.test(databaseVerification)) throw new Error('Database quality gate must execute the synthetic governance integration suite.')
if (!/verify_database_api_security_posture/.test(databaseVerification)) throw new Error('Database quality gate must verify the PostgREST and RLS helper security posture.')
if (!/verify_semantic_search_posture/.test(databaseVerification)) throw new Error('Database quality gate must verify semantic search database posture.')

console.log('Governance architecture verification completed.')

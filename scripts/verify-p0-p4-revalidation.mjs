import fs from 'node:fs'

const { verifyWorkflowActionPinning } = await import('./verify-workflow-action-pinning.mjs')
await verifyWorkflowActionPinning()
await import('./test-workflow-action-pinning.mjs')
const { verifyWorkflowSecurityPosture } = await import('./verify-workflow-security-posture.mjs')
await verifyWorkflowSecurityPosture()
await import('./verify-platform-assurance-baseline.mjs')
await import('./verify-post-implementation-certification-contract.mjs')
await import('./verify-residual-risk-register.mjs')

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const certificationRequest = read('app/api/stewardship/certifications/route.ts')
const certificationReview = read('app/api/stewardship/certifications/[requestId]/route.ts')
const catalogRoute = read('app/api/catalog/[datasetId]/route.ts')
const catalogUi = read('app/catalog/catalog-manager.tsx')
const classificationReview = read('app/api/classification/[classificationId]/route.ts')
const agentProfilingExecutor = read('lib/agents/executors/profiling-executor.ts')
const profilingExecutor = read('lib/profiling/executor.ts')
const metricEngine = read('lib/profiling/metric-engine.ts')
const certificationBoundaryMigration = read('supabase/migrations/20260910113000_p0_govern_certification_transitions.sql')
const certificationRuntimeMigration = read('supabase/migrations/20260912054927_reconcile_certification_membership_runtime.sql')
const certificationSnapshotSchema = read('supabase/migrations/20260912055356_reconcile_certification_prior_snapshot_schema.sql')

assert(certificationRequest.includes("requireApiUser"), 'Certification request API must use API-safe authentication.')
assert(certificationRequest.includes("rpc('request_dataset_certification'"), 'Certification requests must use governed RPC.')
assert(!certificationRequest.includes("from('certification_requests').insert"), 'Certification request API must not insert workflow state directly.')
assert(certificationReview.includes("requireApiUser"), 'Certification review API must use API-safe authentication.')
assert(certificationReview.includes("rpc('review_dataset_certification'"), 'Certification reviews must use governed RPC.')
assert(!certificationReview.includes("from('dataset_catalog').upsert"), 'Certification review API must not mutate catalog certification state directly.')

assert(catalogRoute.includes("'certificationStatus' in body"), 'Catalog API must reject direct certification state input.')
assert(!catalogRoute.includes('certification_status:'), 'Catalog metadata payload must not set certification status.')
assert(!catalogRoute.includes('certified_by:'), 'Catalog metadata payload must not set certification actor.')
assert(!catalogUi.includes('name="certificationStatus"'), 'Catalog UI must not expose editable certification status.')

assert(classificationReview.includes('requireApiUser'), 'Classification review API must use API-safe authentication.')
assert(classificationReview.includes("authorizeProject(user.id, item.project_id, 'classification.review')"), 'Classification review must require the explicit project capability.')
assert(!classificationReview.includes("from('organization_members')"), 'Classification review must not authorize any organization member directly.')

assert(certificationBoundaryMigration.includes('before insert or update on governance.dataset_catalog'), 'Dataset catalog certification guard must cover inserts and updates.')
assert(certificationBoundaryMigration.includes("current_user <> 'postgres'"), 'Certification state guard must reject untrusted direct writers.')
assert(certificationRuntimeMigration.includes('FROM app.projects p'), 'Certification ownership validation must use the authoritative app.projects schema.')
assert(certificationRuntimeMigration.includes('FROM app.organization_members om'), 'Certification reviewer assignment must validate organization membership.')
assert(certificationRuntimeMigration.includes('om.organization_id = v_organization_id'), 'Certification reviewer membership must be scoped to the project organization.')
assert(certificationRuntimeMigration.includes('om.user_id = p_assigned_to'), 'Certification reviewer membership must bind the assigned user.')
assert(!certificationRuntimeMigration.includes('om.is_active'), 'Certification runtime must not reference the non-existent organization_members.is_active column.')
assert(certificationRuntimeMigration.includes('prior_certification_status'), 'Certification runtime must preserve prior certification state for cancellation.')
assert(certificationRuntimeMigration.includes("v_target_status IN ('APPROVED','REJECTED','CANCELLED')"), 'Certification terminal review flow must include governed cancellation.')
assert(certificationRuntimeMigration.includes('GRANT EXECUTE ON FUNCTION governance.request_dataset_certification'), 'Governed request RPC must explicitly grant service execution.')
assert(certificationRuntimeMigration.includes('GRANT EXECUTE ON FUNCTION governance.review_dataset_certification'), 'Governed review RPC must explicitly grant service execution.')
assert(certificationRuntimeMigration.includes('REVOKE ALL ON FUNCTION governance.request_dataset_certification'), 'Governed request RPC must revoke client execution.')
assert(certificationRuntimeMigration.includes('REVOKE ALL ON FUNCTION governance.review_dataset_certification'), 'Governed review RPC must revoke client execution.')

for (const column of ['prior_certification_status', 'prior_certified_at', 'prior_certified_by']) {
  assert(certificationSnapshotSchema.includes(`ADD COLUMN IF NOT EXISTS ${column}`), `Certification reconstruction must explicitly restore ${column}.`)
}
assert(certificationSnapshotSchema.includes('certification_requests_prior_certification_status_check'), 'Certification prior-state status constraint must be reconstruction-safe.')
assert(certificationSnapshotSchema.includes("'UNCERTIFIED','PENDING','CERTIFIED','REJECTED','EXPIRED'"), 'Certification prior-state vocabulary must be bounded.')

assert(agentProfilingExecutor.includes('executeProfilingMetrics(datasetVersionId, profilingRunId, {})'), 'Metric executor must discard caller-supplied evidence rows.')
assert(agentProfilingExecutor.includes('Never forward caller supplied rows'), 'Profiling executor must document the caller-evidence boundary.')
assert(metricEngine.includes('dataset_execution_sources'), 'Metric engine must resolve a registered execution source.')
assert(metricEngine.includes('loadProfilingRows'), 'Metric execution must load evidence from trusted source access.')
assert(profilingExecutor.includes('Metadata-only evidence is not accepted.'), 'Profile execution must reject metadata-only evidence.')
assert(!profilingExecutor.includes('used metadata-only profile.'), 'Metadata-only profile fallback must remain removed.')

console.log('P0-P4 revalidation source-boundary checks passed.')

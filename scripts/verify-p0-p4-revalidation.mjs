import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const certificationRequest = read('app/api/stewardship/certifications/route.ts')
const certificationReview = read('app/api/stewardship/certifications/[requestId]/route.ts')
const catalogRoute = read('app/api/catalog/[datasetId]/route.ts')
const catalogUi = read('app/catalog/catalog-manager.tsx')
const classificationReview = read('app/api/classification/[classificationId]/route.ts')
const classificationReviewCanonical = read('app/api/classifications/[classificationId]/route.ts')
const agentProfilingExecutor = read('lib/agents/executors/profiling-executor.ts')
const profilingExecutor = read('lib/profiling/executor.ts')
const metricEngine = read('lib/profiling/metric-engine.ts')
const originalCertificationMigration = read('supabase/migrations/20260910113000_p0_govern_certification_transitions.sql')
const certificationRuntimeFix = read('supabase/migrations/20260910193000_fix_p0_certification_runtime_contract.sql')

assert(certificationRequest.includes('requireApiUser'), 'Certification request API must use API-safe authentication.')
assert(certificationRequest.includes("rpc('request_dataset_certification'"), 'Certification requests must use governed RPC.')
assert(!certificationRequest.includes("from('certification_requests').insert"), 'Certification request API must not insert workflow state directly.')
assert(certificationReview.includes('requireApiUser'), 'Certification review API must use API-safe authentication.')
assert(certificationReview.includes("rpc('review_dataset_certification'"), 'Certification reviews must use governed RPC.')
assert(!certificationReview.includes("from('dataset_catalog').upsert"), 'Certification review API must not mutate catalog certification state directly.')

assert(catalogRoute.includes("'certificationStatus' in body"), 'Catalog API must reject direct certification state input.')
assert(!catalogRoute.includes('certification_status:'), 'Catalog metadata payload must not set certification status.')
assert(!catalogRoute.includes('certified_by:'), 'Catalog metadata payload must not set certification actor.')
assert(!catalogUi.includes('name="certificationStatus"'), 'Catalog UI must not expose editable certification status.')

for (const [label, route] of [['legacy classification review', classificationReview], ['canonical classification review', classificationReviewCanonical]]) {
  assert(route.includes('requireApiUser'), `${label} must use API-safe authentication.`)
  assert(route.includes("'classification.review'"), `${label} must require the explicit project capability.`)
  assert(route.includes("rpc('review_dataset_classification'"), `${label} must use the atomic governed classification review RPC.`)
  assert(!route.includes(".from('dataset_classifications')\n      .update"), `${label} must not write classification authority state directly.`)
}

assert(originalCertificationMigration.includes('before insert or update on governance.dataset_catalog'), 'Dataset catalog certification guard must cover inserts and updates.')
assert(originalCertificationMigration.includes("current_user <> 'postgres'"), 'Certification state guard must reject untrusted direct writers.')
assert(certificationRuntimeFix.includes('from app.projects p'), 'Certification ownership validation must use the live app.projects schema.')
assert(certificationRuntimeFix.includes('from app.organization_members om'), 'Certification reviewer validation must use the live membership table.')
assert(!certificationRuntimeFix.includes('om.is_active'), 'Certification runtime must not reference a nonexistent organization membership state column.')
assert(certificationRuntimeFix.includes('prior_certification_status'), 'Certification cancellation must preserve the pre-request catalog state.')
assert(certificationRuntimeFix.includes("v_catalog_status := coalesce(v_request.prior_certification_status, 'UNCERTIFIED')"), 'Certification cancellation must restore the prior catalog status.')
assert(certificationRuntimeFix.includes('v_catalog_certified_at := v_request.prior_certified_at'), 'Certification cancellation must restore prior certification time evidence.')
assert(certificationRuntimeFix.includes('v_catalog_certified_by := v_request.prior_certified_by'), 'Certification cancellation must restore prior certification actor evidence.')
assert(certificationRuntimeFix.includes('grant execute on function governance.request_dataset_certification'), 'Governed request RPC must explicitly grant service execution.')
assert(certificationRuntimeFix.includes('grant execute on function governance.review_dataset_certification'), 'Governed review RPC must explicitly grant service execution.')

assert(agentProfilingExecutor.includes('executeProfilingMetrics(datasetVersionId, profilingRunId)'), 'Agent metric execution must call the trusted metric engine without a caller evidence argument.')
assert(agentProfilingExecutor.includes('Never forward caller supplied rows'), 'Profiling executor must document the caller-evidence boundary.')
assert(metricEngine.includes('dataset_execution_sources'), 'Metric engine must resolve a registered execution source.')
assert(metricEngine.includes('const loaded = await loadProfilingRows(supabase, datasetVersionId, 1000)'), 'Metric execution must always load evidence from trusted source access.')
assert(!metricEngine.includes('input.rows'), 'Metric engine must not accept caller-supplied row evidence.')
assert(!metricEngine.includes('const inputRows'), 'Metric engine must not retain a caller-row fallback.')
assert(profilingExecutor.includes('Metadata-only evidence is not accepted.'), 'Profile execution must reject metadata-only evidence.')
assert(!profilingExecutor.includes('used metadata-only profile.'), 'Metadata-only profile fallback must remain removed.')

console.log('P0-P4 revalidation source-boundary checks passed.')

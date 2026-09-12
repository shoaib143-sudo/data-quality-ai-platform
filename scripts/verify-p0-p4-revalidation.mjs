import fs from 'node:fs'

await import('./verify-workflow-action-pinning.mjs')
await import('./verify-platform-assurance-baseline.mjs')

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
const migration = read('supabase/migrations/20260910113000_p0_govern_certification_transitions.sql')

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

assert(migration.includes('before insert or update on governance.dataset_catalog'), 'Dataset catalog certification guard must cover inserts and updates.')
assert(migration.includes("current_user <> 'postgres'"), 'Certification state guard must reject untrusted direct writers.')
assert(migration.includes('from app.projects p'), 'Certification ownership validation must use the live app.projects schema.')
assert(migration.includes('om.is_active = true'), 'Certification reviewer membership must require active membership.')
assert(migration.includes('grant execute on function governance.request_dataset_certification'), 'Governed request RPC must explicitly grant service execution.')
assert(migration.includes('grant execute on function governance.review_dataset_certification'), 'Governed review RPC must explicitly grant service execution.')

assert(agentProfilingExecutor.includes('executeProfilingMetrics(datasetVersionId, profilingRunId, {})'), 'Metric executor must discard caller-supplied evidence rows.')
assert(agentProfilingExecutor.includes('Never forward caller supplied rows'), 'Profiling executor must document the caller-evidence boundary.')
assert(metricEngine.includes('dataset_execution_sources'), 'Metric engine must resolve a registered execution source.')
assert(metricEngine.includes('loadProfilingRows'), 'Metric execution must load evidence from trusted source access.')
assert(profilingExecutor.includes('Metadata-only evidence is not accepted.'), 'Profile execution must reject metadata-only evidence.')
assert(!profilingExecutor.includes('used metadata-only profile.'), 'Metadata-only profile fallback must remain removed.')

console.log('P0-P4 revalidation source-boundary checks passed.')

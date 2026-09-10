import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !serviceRoleKey) {
  console.log('SKIP P0 certification runtime verification: Supabase runtime credentials are required.')
  process.exit(0)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const [{ data: projects, error: projectsError }, { data: memberships, error: membershipsError }] = await Promise.all([
  supabase.schema('app').from('projects').select('id,organization_id').limit(100),
  supabase.schema('app').from('organization_members').select('organization_id,user_id,role').limit(100),
])
if (projectsError) throw new Error(`Unable to inspect projects for certification probe: ${projectsError.message}`)
if (membershipsError) throw new Error(`Unable to inspect memberships for certification probe: ${membershipsError.message}`)

let probe = null
for (const membership of memberships ?? []) {
  for (const project of (projects ?? []).filter((candidate) => candidate.organization_id === membership.organization_id)) {
    const { data: allowed, error: capabilityError } = await supabase.schema('governance').rpc('has_project_capability', {
      p_project_id: project.id,
      p_user_id: membership.user_id,
      p_capability: 'certification.request',
    })
    if (capabilityError) throw new Error(`Unable to verify certification capability: ${capabilityError.message}`)
    if (allowed !== true) continue

    const { data: dataset, error: datasetError } = await supabase
      .schema('catalog')
      .from('datasets')
      .select('id')
      .eq('project_id', project.id)
      .limit(1)
      .maybeSingle()
    if (datasetError) throw new Error(`Unable to resolve certification probe dataset: ${datasetError.message}`)
    if (dataset) {
      probe = { projectId: project.id, datasetId: dataset.id, actorUserId: membership.user_id }
      break
    }
  }
  if (probe) break
}

if (!probe) throw new Error('No project member with certification.request and a dataset is available for the P0 runtime probe.')

// An invalid assigned reviewer exercises the membership lookup without creating a request.
// Correct behavior is the governed FK-style rejection. A schema mismatch (for example a
// stale column reference) surfaces as a different SQLSTATE and fails this verification.
const invalidReviewer = randomUUID()
const { error: requestProbeError } = await supabase.schema('governance').rpc('request_dataset_certification', {
  p_project_id: probe.projectId,
  p_dataset_id: probe.datasetId,
  p_actor_user_id: probe.actorUserId,
  p_assigned_to: invalidReviewer,
  p_evidence: {},
})
if (!requestProbeError) throw new Error('Certification runtime probe unexpectedly accepted a reviewer outside the project organization.')
if (requestProbeError.code !== '23503' || !/not a member of the project organization/i.test(requestProbeError.message ?? '')) {
  throw new Error(`Certification runtime contract is invalid: ${requestProbeError.code ?? 'UNKNOWN'} ${requestProbeError.message ?? 'unknown error'}`)
}
console.log('PASS certification request RPC matches the live organization membership schema')

const { data: catalogRow, error: catalogError } = await supabase
  .schema('governance')
  .from('dataset_catalog')
  .select('dataset_id,certification_status')
  .limit(1)
  .maybeSingle()
if (catalogError) throw new Error(`Unable to inspect catalog certification guard: ${catalogError.message}`)
if (catalogRow) {
  const attemptedStatus = catalogRow.certification_status === 'PENDING' ? 'UNCERTIFIED' : 'PENDING'
  const { error: directWriteError } = await supabase
    .schema('governance')
    .from('dataset_catalog')
    .update({ certification_status: attemptedStatus })
    .eq('dataset_id', catalogRow.dataset_id)
  if (!directWriteError) throw new Error('Service-role direct catalog certification mutation unexpectedly succeeded.')
  if (directWriteError.code !== '42501') {
    throw new Error(`Catalog certification guard returned unexpected SQLSTATE ${directWriteError.code ?? 'UNKNOWN'}: ${directWriteError.message ?? ''}`)
  }
  console.log('PASS direct service-role certification-state mutation is blocked')
}

console.log('P0 certification runtime verification completed.')

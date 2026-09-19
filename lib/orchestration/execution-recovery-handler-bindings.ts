import { createAdminClient } from '@/lib/supabase/admin'
import { executeProfileReadinessRemediation } from '@/lib/profiling/readiness-remediation-agent'
import { revalidateAndReconcileSourceForProfiling } from '@/lib/profiling/source-readiness-repair'
import { ExecutionRecoveryHandlerRegistry } from './execution-recovery-runtime.ts'
import {
  createLeaseReconciliationRecoveryHandler,
  createProfilingReadinessRecoveryHandler,
  createSourceReadinessRecoveryHandler,
} from './execution-recovery-handlers.ts'

async function verifySourceReadiness(input: { projectId: string; sourceId: string }) {
  const admin = createAdminClient()
  const { data: source, error: sourceError } = await admin
    .schema('catalog')
    .from('data_sources')
    .select('id,status')
    .eq('id', input.sourceId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (sourceError) throw new Error(`Unable to independently validate source readiness: ${sourceError.message}`)
  if (!source) return { valid: false, code: 'SOURCE_NOT_FOUND' }
  if (source.status !== 'ACTIVE') return { valid: false, code: 'SOURCE_NOT_ACTIVE' }

  const { data: datasets, error: datasetError } = await admin
    .schema('catalog')
    .from('datasets')
    .select('id')
    .eq('project_id', input.projectId)
    .eq('data_source_id', input.sourceId)
  if (datasetError) throw new Error(`Unable to validate source dataset bindings: ${datasetError.message}`)
  const datasetIds = (datasets ?? []).map(dataset => String(dataset.id))
  if (!datasetIds.length) return { valid: true, code: 'SOURCE_ACTIVE' }

  const { data: versions, error: versionError } = await admin
    .schema('catalog')
    .from('dataset_versions')
    .select('id,dataset_id,version_number,status')
    .in('dataset_id', datasetIds)
    .order('version_number', { ascending: false })
  if (versionError) throw new Error(`Unable to validate source dataset versions: ${versionError.message}`)

  const latestByDataset = new Map<string, { id: string; status: string }>()
  for (const version of versions ?? []) {
    const datasetId = String(version.dataset_id)
    if (!latestByDataset.has(datasetId)) {
      latestByDataset.set(datasetId, { id: String(version.id), status: String(version.status) })
    }
  }
  if (latestByDataset.size !== datasetIds.length) return { valid: false, code: 'LATEST_DATASET_VERSION_MISSING' }
  if ([...latestByDataset.values()].some(version => version.status !== 'AVAILABLE')) {
    return { valid: false, code: 'LATEST_DATASET_VERSION_NOT_AVAILABLE' }
  }

  const versionIds = [...latestByDataset.values()].map(version => version.id)
  const { data: executionSources, error: executionError } = await admin
    .schema('profiling')
    .from('dataset_execution_sources')
    .select('dataset_version_id,active')
    .in('dataset_version_id', versionIds)
  if (executionError) throw new Error(`Unable to validate profiling source bindings: ${executionError.message}`)
  const activeVersions = new Set(
    (executionSources ?? [])
      .filter(binding => binding.active === true)
      .map(binding => String(binding.dataset_version_id)),
  )
  const valid = versionIds.every(versionId => activeVersions.has(versionId))
  return { valid, code: valid ? 'SOURCE_READINESS_RESTORED' : 'EXECUTION_SOURCE_NOT_BOUND' }
}

async function reconcileDurableJobLease(input: { projectId: string; durableJobId: string }) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('orchestration')
    .from('job_queue')
    .update({
      lease_owner: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.durableJobId)
    .eq('project_id', input.projectId)
    .eq('status', 'DEAD')
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Unable to reconcile durable job lease: ${error.message}`)
  return { reconciled: Boolean(data) }
}

async function verifyDurableJobLease(input: { projectId: string; durableJobId: string }) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('orchestration')
    .from('job_queue')
    .select('status,lease_owner,lease_expires_at')
    .eq('id', input.durableJobId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (error) throw new Error(`Unable to validate durable job lease: ${error.message}`)
  if (!data) throw new Error('Durable job was not found during lease validation.')
  return {
    status: String(data.status),
    leaseOwner: data.lease_owner ? String(data.lease_owner) : null,
    leaseExpiresAt: data.lease_expires_at ? String(data.lease_expires_at) : null,
  }
}

async function verifyProfilingReadiness(input: { projectId: string; datasetVersionId: string }) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('catalog').rpc('verify_dataset_version_profile_readiness', {
    p_project_id: input.projectId,
    p_dataset_version_id: input.datasetVersionId,
  })
  if (error) throw new Error(`Unable to independently validate profiling readiness: ${error.message}`)
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
}

export function createDefaultExecutionRecoveryRegistry() {
  return new ExecutionRecoveryHandlerRegistry([
    createSourceReadinessRecoveryHandler({ repair: revalidateAndReconcileSourceForProfiling, verify: verifySourceReadiness }),
    createLeaseReconciliationRecoveryHandler({ reconcile: reconcileDurableJobLease, verify: verifyDurableJobLease }),
    createProfilingReadinessRecoveryHandler({
      repair: executeProfileReadinessRemediation,
      verify: verifyProfilingReadiness,
    }),
  ])
}

import { createAdminClient } from '@/lib/supabase/admin'
import { executeProfileReadinessRemediation } from '@/lib/profiling/readiness-remediation-agent'
import { revalidateAndReconcileSourceForProfiling } from '@/lib/profiling/source-readiness-repair'
import { ExecutionRecoveryHandlerRegistry } from './execution-recovery-runtime'
import {
  createLeaseReconciliationRecoveryHandler,
  createProfilingReadinessRecoveryHandler,
  createSourceReadinessRecoveryHandler,
} from './execution-recovery-handlers'

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
    createSourceReadinessRecoveryHandler({ repair: revalidateAndReconcileSourceForProfiling }),
    createLeaseReconciliationRecoveryHandler({ reconcile: reconcileDurableJobLease, verify: verifyDurableJobLease }),
    createProfilingReadinessRecoveryHandler({
      repair: executeProfileReadinessRemediation,
      verify: verifyProfilingReadiness,
    }),
  ])
}

import { createAdminClient } from '@/lib/supabase/admin'
import { executeProfileReadinessRemediation } from '@/lib/profiling/readiness-remediation-agent'
import { revalidateAndReconcileSourceForProfiling } from '@/lib/profiling/source-readiness-repair'
import { ExecutionRecoveryHandlerRegistry } from './execution-recovery-runtime'
import {
  createProfilingReadinessRecoveryHandler,
  createSourceReadinessRecoveryHandler,
} from './execution-recovery-handlers'

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
    createProfilingReadinessRecoveryHandler({
      repair: executeProfileReadinessRemediation,
      verify: verifyProfilingReadiness,
    }),
  ])
}

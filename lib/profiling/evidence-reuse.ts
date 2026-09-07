import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { validateProfilingRun } from '@/lib/profiling/run-validation'

export type ProfileReuseDecision = {
  reused: boolean
  eligible: boolean
  reason: string
  sourceProfileRunId: string | null
  contentHashAuthority: string
  configurationHash: string | null
  profileSignature: string | null
}

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function samplingContract(summary: unknown) {
  const sourceAccess = record(record(summary).source_access)
  const policy = record(sourceAccess.sampling_policy)
  return {
    mode: policy.mode ?? null,
    origin: policy.origin ?? null,
    configured_max_rows: policy.configured_max_rows ?? null,
    sample_percent: policy.sample_percent ?? null,
    deterministic_seed: policy.deterministic_seed ?? null,
    coverage_scope: policy.coverage_scope ?? null,
    full_source_coverage_claimed: policy.full_source_coverage_claimed === true,
  }
}

async function metricContractFingerprint(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .schema('profiling')
    .from('metric_definitions')
    .select('id,metric_key,scope')
    .eq('enabled', true)
    .order('scope')
    .order('metric_key')
  if (error) throw new Error(`Unable to resolve metric contract for evidence reuse: ${error.message}`)
  return (data ?? []).map((row) => ({ id: row.id, metric_key: row.metric_key, scope: row.scope }))
}

export async function tryReuseProfileEvidence(input: {
  supabase: SupabaseClient
  userId: string
  projectId: string
  datasetVersionId: string
  profilingRunId: string
  engineName: string
  engineVersion: string
}): Promise<ProfileReuseDecision> {
  const { supabase, userId, projectId, datasetVersionId, profilingRunId, engineName, engineVersion } = input

  const [{ data: run, error: runError }, { data: executionSources, error: sourceError }] = await Promise.all([
    supabase.schema('profiling').from('profile_runs').select('id,status,content_hash,schema_hash,summary').eq('id', profilingRunId).maybeSingle(),
    supabase.schema('profiling').from('dataset_execution_sources').select('source_type,active,updated_at').eq('dataset_version_id', datasetVersionId).eq('active', true).order('updated_at', { ascending: false }).limit(1),
  ])
  if (runError || !run) throw new Error(`Unable to resolve current profiling run for evidence reuse: ${runError?.message ?? 'not found'}`)
  if (sourceError) throw new Error(`Unable to resolve execution source for evidence reuse: ${sourceError.message}`)

  const sourceType = String(executionSources?.[0]?.source_type ?? '').trim().toUpperCase()
  if (!['FILE', 'CSV'].includes(sourceType)) {
    return {
      reused: false,
      eligible: false,
      reason: 'SOURCE_FRESHNESS_FINGERPRINT_UNAVAILABLE',
      sourceProfileRunId: null,
      contentHashAuthority: sourceType === 'JDBC' ? 'STRUCTURE_HASH_NOT_SOURCE_CONTENT' : 'UNAVAILABLE',
      configurationHash: null,
      profileSignature: null,
    }
  }

  const contentHash = typeof run.content_hash === 'string' && run.content_hash.trim() ? run.content_hash.trim() : null
  const schemaHash = typeof run.schema_hash === 'string' && run.schema_hash.trim() ? run.schema_hash.trim() : null
  if (!contentHash || !schemaHash) {
    return {
      reused: false,
      eligible: false,
      reason: 'STRONG_FILE_FINGERPRINT_NOT_PERSISTED',
      sourceProfileRunId: null,
      contentHashAuthority: 'SOURCE_BYTES_SHA256',
      configurationHash: null,
      profileSignature: null,
    }
  }

  const metricContract = await metricContractFingerprint(supabase)
  const configuration = {
    engine_name: engineName,
    engine_version: engineVersion,
    sampling: samplingContract(run.summary),
    metric_contract: metricContract,
  }
  const configurationHash = stableHash(configuration)
  const profileSignature = stableHash({
    dataset_version_id: datasetVersionId,
    content_hash: contentHash,
    schema_hash: schemaHash,
    configuration_hash: configurationHash,
  })

  const { error: fingerprintError } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .update({
      content_hash: contentHash,
      configuration_hash: configurationHash,
      profile_signature: profileSignature,
      configuration,
    })
    .eq('id', profilingRunId)
    .eq('status', 'RUNNING')
  if (fingerprintError) throw new Error(`Unable to persist profiling evidence fingerprint: ${fingerprintError.message}`)

  const { data: candidates, error: candidateError } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('id,summary,completed_at')
    .eq('dataset_version_id', datasetVersionId)
    .eq('status', 'COMPLETED')
    .eq('content_hash', contentHash)
    .eq('schema_hash', schemaHash)
    .eq('configuration_hash', configurationHash)
    .eq('profile_signature', profileSignature)
    .neq('id', profilingRunId)
    .order('completed_at', { ascending: false })
    .limit(10)
  if (candidateError) throw new Error(`Unable to resolve profiling evidence reuse candidates: ${candidateError.message}`)

  const sourceRun = (candidates ?? []).find((candidate) => record(candidate.summary).execution_mode !== 'REUSED') ?? null
  if (!sourceRun) {
    return {
      reused: false,
      eligible: true,
      reason: 'NO_MATCHING_EXECUTED_EVIDENCE',
      sourceProfileRunId: null,
      contentHashAuthority: 'SOURCE_BYTES_SHA256',
      configurationHash,
      profileSignature,
    }
  }

  const validation = await validateProfilingRun(sourceRun.id, userId)
  if (!validation.valid) {
    return {
      reused: false,
      eligible: true,
      reason: 'MATCHING_EVIDENCE_FAILED_CURRENT_CONTRACT_VALIDATION',
      sourceProfileRunId: sourceRun.id,
      contentHashAuthority: 'SOURCE_BYTES_SHA256',
      configurationHash,
      profileSignature,
    }
  }

  const { data: reusedRunId, error: reuseError } = await supabase.schema('profiling').rpc('reuse_profile_evidence', {
    p_project_id: projectId,
    p_profile_run_id: profilingRunId,
    p_source_profile_run_id: sourceRun.id,
    p_profile_signature: profileSignature,
  })
  if (reuseError) throw new Error(`Unable to materialize reused profiling evidence: ${reuseError.message}`)
  if (reusedRunId !== profilingRunId) throw new Error('Profiling evidence reuse returned an unexpected run identity.')

  return {
    reused: true,
    eligible: true,
    reason: 'EXACT_SOURCE_BYTES_AND_EXECUTION_FINGERPRINT_MATCH',
    sourceProfileRunId: sourceRun.id,
    contentHashAuthority: 'SOURCE_BYTES_SHA256',
    configurationHash,
    profileSignature,
  }
}

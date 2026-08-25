import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_TOOLS = new Set([
  'inspect_dataset',
  'infer_column_types',
  'profile_dataset',
  'detect_patterns',
  'infer_candidate_keys',
  'compare_profiles',
  'persist_profile_snapshot',
  'complete_profile_run',
  'detect_outliers',
  'detect_sensitive_columns',
  'get_profile_run',
  'detect_duplicates',
])

export type ProfilingToolRequest = {
  toolKey: string
  datasetVersionId: string
  profilingRunId?: string
  input?: Record<string, unknown>
}

export async function executeProfilingTool(
  request: ProfilingToolRequest,
) {
  const {
    toolKey,
    datasetVersionId,
    profilingRunId,
    input = {},
  } = request

  if (!ALLOWED_TOOLS.has(toolKey)) {
    throw new Error(`Unsupported profiling tool: ${toolKey}`)
  }

  if (!datasetVersionId) {
    throw new Error('datasetVersionId is required')
  }

  const supabase = createAdminClient()

  switch (toolKey) {
    case 'inspect_dataset':
      return inspectDataset(
        supabase,
        datasetVersionId,
      )

    case 'get_profile_run':
      return getProfileRun(
        supabase,
        profilingRunId,
      )

    case 'persist_profile_snapshot':
      return persistProfileSnapshot(
        supabase,
        input,
      )

    case 'complete_profile_run':
      return completeProfileRun(
        supabase,
        input,
      )

    case 'infer_column_types':
    case 'profile_dataset':
    case 'detect_patterns':
    case 'infer_candidate_keys':
    case 'compare_profiles':
    case 'detect_outliers':
    case 'detect_sensitive_columns':
    case 'detect_duplicates':
      return {
        tool: toolKey,
        status: 'accepted',
        dataset_version_id: datasetVersionId,
        profiling_run_id: profilingRunId ?? null,
        input,
        message:
          'Tool execution contract registered. Implementation pending.',
      }

    default:
      throw new Error(
        `Unhandled profiling tool: ${toolKey}`,
      )
  }
}


async function inspectDataset(
  supabase: ReturnType<typeof createAdminClient>,
  datasetVersionId: string,
) {
  const { data, error } = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select('*')
    .eq('id', datasetVersionId)
    .single()

  if (error) {
    throw new Error(
      `Unable to inspect dataset version: ${error.message}`,
    )
  }

  return {
    tool: 'inspect_dataset',
    dataset_version_id: datasetVersionId,
    dataset_version: data,
  }
}


async function getProfileRun(
  supabase: ReturnType<typeof createAdminClient>,
  profilingRunId?: string,
) {
  if (!profilingRunId) {
    throw new Error(
      'profilingRunId is required for get_profile_run',
    )
  }

  const { data, error } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('*')
    .eq('id', profilingRunId)
    .single()

  if (error) {
    throw new Error(
      `Unable to get profile run: ${error.message}`,
    )
  }

  return {
    tool: 'get_profile_run',
    profiling_run_id: profilingRunId,
    profile_run: data,
  }
}


async function persistProfileSnapshot(
  supabase: ReturnType<typeof createAdminClient>,
  input: Record<string, unknown>,
) {
  const {
    profile_run_id,
    dataset_version_id,
    schema_hash,
    schema,
  } = input

  if (
    !profile_run_id ||
    !dataset_version_id ||
    !schema_hash ||
    !schema
  ) {
    throw new Error(
      'profile_run_id, dataset_version_id, schema_hash and schema are required',
    )
  }

  const { data, error } = await supabase
    .schema('profiling')
    .from('schema_snapshots')
    .insert({
      profile_run_id,
      dataset_version_id,
      schema_hash,
      schema,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `Unable to persist schema snapshot: ${error.message}`,
    )
  }

  return {
    tool: 'persist_profile_snapshot',
    snapshot: data,
  }
}


async function completeProfileRun(
  supabase: ReturnType<typeof createAdminClient>,
  input: Record<string, unknown>,
) {
  const {
    profile_run_id,
    status = 'COMPLETED',
  } = input

  if (!profile_run_id) {
    throw new Error(
      'profile_run_id is required for complete_profile_run',
    )
  }

  const { data, error } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .update({
      status,
    })
    .eq('id', profile_run_id)
    .select()
    .single()

  if (error) {
    throw new Error(
      `Unable to complete profile run: ${error.message}`,
    )
  }

  return {
    tool: 'complete_profile_run',
    profile_run: data,
  }
}
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function assertGovernedActionReferencesInProject(input: {
  projectId: string
  targetType: string
  targetId?: string | null
  sourceAgentRunId?: string | null
}) {
  const admin = createAdminClient()
  const projectId = input.projectId
  const targetType = input.targetType.trim().toUpperCase()
  const targetId = text(input.targetId)
  const sourceAgentRunId = text(input.sourceAgentRunId)

  if (sourceAgentRunId) {
    const { data, error } = await admin.schema('agent').from('agent_runs')
      .select('id')
      .eq('id', sourceAgentRunId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (error) throw new Error(`Unable to validate governed action source run scope: ${error.message}`)
    if (!data) throw new Error('Governed action sourceAgentRunId does not belong to the requested project.')
  }

  if (targetType === 'PROJECT') {
    if (targetId && targetId !== projectId) throw new Error('Governed action PROJECT target must match the requested project.')
    return
  }

  if (!targetId) throw new Error(`Governed action ${targetType || 'UNKNOWN'} target requires targetId.`)

  if (targetType === 'DATASET') {
    const { data, error } = await admin.schema('catalog').from('datasets')
      .select('id')
      .eq('id', targetId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (error) throw new Error(`Unable to validate governed action dataset scope: ${error.message}`)
    if (!data) throw new Error('Governed action DATASET target does not belong to the requested project.')
    return
  }

  if (targetType === 'DATASET_VERSION') {
    const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions')
      .select('id,dataset_id')
      .eq('id', targetId)
      .maybeSingle()
    if (versionError) throw new Error(`Unable to validate governed action dataset-version scope: ${versionError.message}`)
    if (!version) throw new Error('Governed action DATASET_VERSION target was not found.')
    const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets')
      .select('id')
      .eq('id', version.dataset_id)
      .eq('project_id', projectId)
      .maybeSingle()
    if (datasetError) throw new Error(`Unable to validate governed action dataset-version project: ${datasetError.message}`)
    if (!dataset) throw new Error('Governed action DATASET_VERSION target does not belong to the requested project.')
    return
  }

  if (targetType === 'QUALITY_RULE') {
    const { data, error } = await admin.schema('profiling').from('quality_rule_definitions')
      .select('id')
      .eq('id', targetId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (error) throw new Error(`Unable to validate governed action quality-rule scope: ${error.message}`)
    if (!data) throw new Error('Governed action QUALITY_RULE target does not belong to the requested project.')
    return
  }

  throw new Error(`Unsupported governed action target type: ${targetType || 'UNKNOWN'}.`)
}

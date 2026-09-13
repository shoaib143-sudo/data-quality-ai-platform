import { createAdminClient } from '@/lib/supabase/admin'
import type { BusinessCriticality } from './agent-policy-v2'

export type DataSensitivity = 'LOW' | 'MEDIUM' | 'HIGH' | 'RESTRICTED'

export type DatasetRiskContext = {
  projectId: string
  datasetId: string
  domain: string
  businessCriticality: BusinessCriticality
  dataSensitivity: DataSensitivity
  evidence: {
    governedElementIds: string[]
    classificationLabelIds: string[]
  }
}

function sensitivityFromLevel(level: number): DataSensitivity {
  if (level >= 5) return 'RESTRICTED'
  if (level >= 4) return 'HIGH'
  if (level >= 2) return 'MEDIUM'
  return 'LOW'
}

export async function resolveDatasetRiskContext(datasetId: string): Promise<DatasetRiskContext> {
  const admin = createAdminClient()

  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets')
    .select('id,project_id,business_domain,metadata')
    .eq('id', datasetId)
    .maybeSingle()
  if (datasetError) throw new Error(`Unable to resolve dataset risk context: ${datasetError.message}`)
  if (!dataset) throw new Error('Dataset was not found.')

  const [{ data: mappings, error: mappingError }, { data: classifications, error: classificationError }] = await Promise.all([
    admin.schema('governance').from('cde_mappings')
      .select('cde_id,status')
      .eq('dataset_id', datasetId),
    admin.schema('governance').from('dataset_classifications')
      .select('label_id,status,authority_state')
      .eq('dataset_id', datasetId),
  ])
  if (mappingError) throw new Error(`Unable to resolve CDE/KDE mappings: ${mappingError.message}`)
  if (classificationError) throw new Error(`Unable to resolve dataset classifications: ${classificationError.message}`)

  const governedElementIds = [...new Set((mappings ?? [])
    .filter(row => String(row.status ?? '').toUpperCase() !== 'REJECTED')
    .map(row => String(row.cde_id))
    .filter(Boolean))]
  const labelIds = [...new Set((classifications ?? [])
    .filter(row => !['REJECTED','REVOKED'].includes(String(row.status ?? '').toUpperCase()))
    .map(row => String(row.label_id))
    .filter(Boolean))]

  const [{ data: elements, error: elementError }, { data: labels, error: labelError }] = await Promise.all([
    governedElementIds.length
      ? admin.schema('governance').from('critical_data_elements')
          .select('id,criticality,domain,status,metadata')
          .in('id', governedElementIds)
      : Promise.resolve({ data: [], error: null }),
    labelIds.length
      ? admin.schema('governance').from('classification_labels')
          .select('id,sensitivity_level,enabled')
          .in('id', labelIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (elementError) throw new Error(`Unable to resolve governed critical elements: ${elementError.message}`)
  if (labelError) throw new Error(`Unable to resolve classification sensitivity: ${labelError.message}`)

  const activeElements = (elements ?? []).filter(row => String(row.status ?? '').toUpperCase() !== 'RETIRED')
  const criticalityKinds = activeElements.map(row => {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {}
    return [
      String(row.criticality ?? '').toUpperCase(),
      String(metadata.element_type ?? metadata.criticality_type ?? metadata.type ?? '').toUpperCase(),
    ]
  }).flat()
  const hasKde = criticalityKinds.some(value => value === 'KDE' || value.includes('KEY DATA ELEMENT'))
  const hasCde = criticalityKinds.some(value => value === 'CDE' || value.includes('CRITICAL DATA ELEMENT')) || (activeElements.length > 0 && !hasKde)
  const businessCriticality: BusinessCriticality = hasCde ? 'CDE' : hasKde ? 'KDE' : 'STANDARD'

  const sensitivityLevel = Math.max(0, ...(labels ?? [])
    .filter(row => row.enabled !== false)
    .map(row => Number(row.sensitivity_level ?? 0))
    .filter(Number.isFinite))

  const elementDomain = activeElements.map(row => String(row.domain ?? '').trim()).find(Boolean)
  const domain = String(dataset.business_domain ?? '').trim() || elementDomain || 'Unassigned'

  return {
    projectId: String(dataset.project_id),
    datasetId: String(dataset.id),
    domain,
    businessCriticality,
    dataSensitivity: sensitivityFromLevel(sensitivityLevel),
    evidence: {
      governedElementIds,
      classificationLabelIds: labelIds,
    },
  }
}


export type ProjectRiskContext = {
  projectId: string
  domain: string
  businessCriticality: BusinessCriticality
  dataSensitivity: DataSensitivity
  resourceIds: string[]
  evidence: {
    datasetCount: number
    cdeDatasetCount: number
    classificationLabelIds: string[]
  }
}

export async function resolveProjectRiskContext(projectId: string): Promise<ProjectRiskContext> {
  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin.schema('app').from('projects')
    .select('id,name')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) throw new Error(`Unable to resolve project risk context: ${projectError.message}`)
  if (!project) throw new Error('Project was not found.')

  const { data: datasets, error: datasetsError } = await admin.schema('catalog').from('datasets')
    .select('id,business_domain')
    .eq('project_id', projectId)
  if (datasetsError) throw new Error(`Unable to resolve project datasets: ${datasetsError.message}`)

  const datasetIds = (datasets ?? []).map(row => String(row.id))
  if (datasetIds.length === 0) {
    return {
      projectId: String(project.id),
      domain: String(project.name ?? 'Project'),
      businessCriticality: 'STANDARD',
      dataSensitivity: 'LOW',
      resourceIds: [],
      evidence: { datasetCount: 0, cdeDatasetCount: 0, classificationLabelIds: [] },
    }
  }

  const [{ data: mappings, error: mappingError }, { data: classifications, error: classificationError }] = await Promise.all([
    admin.schema('governance').from('cde_mappings')
      .select('dataset_id,cde_id,status')
      .in('dataset_id', datasetIds),
    admin.schema('governance').from('dataset_classifications')
      .select('dataset_id,label_id,status,authority_state')
      .in('dataset_id', datasetIds),
  ])
  if (mappingError) throw new Error(`Unable to resolve project CDE/KDE mappings: ${mappingError.message}`)
  if (classificationError) throw new Error(`Unable to resolve project classifications: ${classificationError.message}`)

  const governedElementIds = [...new Set((mappings ?? [])
    .filter(row => String(row.status ?? '').toUpperCase() !== 'REJECTED')
    .map(row => String(row.cde_id))
    .filter(Boolean))]
  const labelIds = [...new Set((classifications ?? [])
    .filter(row => !['REJECTED','REVOKED'].includes(String(row.status ?? '').toUpperCase()))
    .map(row => String(row.label_id))
    .filter(Boolean))]

  const [{ data: elements, error: elementError }, { data: labels, error: labelError }] = await Promise.all([
    governedElementIds.length
      ? admin.schema('governance').from('critical_data_elements')
          .select('id,criticality,status,metadata')
          .in('id', governedElementIds)
      : Promise.resolve({ data: [], error: null }),
    labelIds.length
      ? admin.schema('governance').from('classification_labels')
          .select('id,sensitivity_level,enabled')
          .in('id', labelIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (elementError) throw new Error(`Unable to resolve project critical elements: ${elementError.message}`)
  if (labelError) throw new Error(`Unable to resolve project sensitivity: ${labelError.message}`)

  const activeElements = (elements ?? []).filter(row => String(row.status ?? '').toUpperCase() !== 'RETIRED')
  const criticalityKinds = activeElements.flatMap(row => {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {}
    return [
      String(row.criticality ?? '').toUpperCase(),
      String(metadata.element_type ?? metadata.criticality_type ?? metadata.type ?? '').toUpperCase(),
    ]
  })
  const hasKde = criticalityKinds.some(value => value === 'KDE' || value.includes('KEY DATA ELEMENT'))
  const hasCde = criticalityKinds.some(value => value === 'CDE' || value.includes('CRITICAL DATA ELEMENT')) || (activeElements.length > 0 && !hasKde)
  const businessCriticality: BusinessCriticality = hasCde ? 'CDE' : hasKde ? 'KDE' : 'STANDARD'

  const sensitivityLevel = Math.max(0, ...(labels ?? [])
    .filter(row => row.enabled !== false)
    .map(row => Number(row.sensitivity_level ?? 0))
    .filter(Number.isFinite))

  const domains = [...new Set((datasets ?? []).map(row => String(row.business_domain ?? '').trim()).filter(Boolean))]
  const domain = domains.length === 1 ? domains[0] : domains.length > 1 ? 'Multi-domain' : String(project.name ?? 'Project')
  const cdeDatasetCount = new Set((mappings ?? [])
    .filter(row => String(row.status ?? '').toUpperCase() !== 'REJECTED')
    .map(row => String(row.dataset_id))).size

  return {
    projectId: String(project.id),
    domain,
    businessCriticality,
    dataSensitivity: sensitivityFromLevel(sensitivityLevel),
    resourceIds: datasetIds,
    evidence: {
      datasetCount: datasetIds.length,
      cdeDatasetCount,
      classificationLabelIds: labelIds,
    },
  }
}

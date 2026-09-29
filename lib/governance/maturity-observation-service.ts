import { authorizeOrganizationAdmin, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

type CoverageObservation = {
  questionId: string
  sourceKey: string
  numerator: number
  denominator: number
  coverage: number
  observedMaturity: number
  confidence: number
}

function maturityFromCoverage(coverage: number) {
  if (coverage <= 0) return 0
  if (coverage < 20) return 1
  if (coverage < 50) return 2
  if (coverage < 75) return 3
  if (coverage < 95) return 4
  return 5
}

function coverage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0
}

function uniqueCovered(rows: Array<{ dataset_id: string | null }>, eligible: Set<string>) {
  return new Set(rows.map(row => row.dataset_id).filter((id): id is string => Boolean(id && eligible.has(id)))).size
}

export async function collectGovernanceMaturityObservations(userId: string, assessmentId: string) {
  const admin = createAdminClient()
  const { data: assessment, error: assessmentError } = await admin.schema('governance').from('maturity_assessments')
    .select('id,organization_id')
    .eq('id', assessmentId)
    .maybeSingle()
  if (assessmentError) throw new Error(`Unable to resolve maturity assessment: ${assessmentError.message}`)
  if (!assessment) throw new AuthorizationError('Maturity assessment was not found.', 404)

  await authorizeOrganizationAdmin(userId, String(assessment.organization_id))

  const { data: projects, error: projectsError } = await admin.schema('app').from('projects')
    .select('id')
    .eq('organization_id', assessment.organization_id)
  if (projectsError) throw new Error(`Unable to load assessment projects: ${projectsError.message}`)
  const projectIds = (projects ?? []).map(row => String(row.id))
  if (!projectIds.length) return { observations: [] as CoverageObservation[], skipped: 'NO_PROJECTS' as const }

  const { data: datasets, error: datasetsError } = await admin.schema('catalog').from('datasets')
    .select('id,business_domain,metadata')
    .in('project_id', projectIds)
  if (datasetsError) throw new Error(`Unable to load assessment datasets: ${datasetsError.message}`)
  const datasetRows = datasets ?? []
  const datasetIds = datasetRows.map(row => String(row.id))
  if (!datasetIds.length) return { observations: [] as CoverageObservation[], skipped: 'NO_DATASETS' as const }

  const datasetSet = new Set(datasetIds)
  const [lineageResult, qualityResult, stewardshipResult] = await Promise.all([
    admin.schema('governance').from('lineage_assets').select('dataset_id').in('dataset_id', datasetIds),
    admin.schema('profiling').from('quality_rule_definitions').select('dataset_id').in('dataset_id', datasetIds).eq('enabled', true),
    admin.schema('governance').from('stewardship_assignments').select('dataset_id').in('dataset_id', datasetIds).eq('active', true),
  ])
  if (lineageResult.error) throw new Error(`Unable to observe lineage coverage: ${lineageResult.error.message}`)
  if (qualityResult.error) throw new Error(`Unable to observe quality-rule coverage: ${qualityResult.error.message}`)
  if (stewardshipResult.error) throw new Error(`Unable to observe stewardship coverage: ${stewardshipResult.error.message}`)

  const metadataCovered = datasetRows.filter(row => {
    const domain = typeof row.business_domain === 'string' ? row.business_domain.trim() : ''
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {}
    return Boolean(domain || Object.keys(metadata).length)
  }).length

  const measures = [
    {
      questionId: 'PRACTICES-METADATA',
      sourceKey: 'DATANEXUS_CATALOG_METADATA_COVERAGE',
      numerator: metadataCovered,
    },
    {
      questionId: 'PRACTICES-QUALITY',
      sourceKey: 'DATANEXUS_DQ_RULE_COVERAGE',
      numerator: uniqueCovered((qualityResult.data ?? []) as Array<{ dataset_id: string | null }>, datasetSet),
    },
    {
      questionId: 'PRACTICES-LINEAGE',
      sourceKey: 'DATANEXUS_LINEAGE_DATASET_COVERAGE',
      numerator: uniqueCovered((lineageResult.data ?? []) as Array<{ dataset_id: string | null }>, datasetSet),
    },
    {
      questionId: 'PEOPLE-STEWARDSHIP',
      sourceKey: 'DATANEXUS_STEWARDSHIP_DATASET_COVERAGE',
      numerator: uniqueCovered((stewardshipResult.data ?? []) as Array<{ dataset_id: string | null }>, datasetSet),
    },
  ]

  const observations: CoverageObservation[] = measures.map(measure => {
    const observedCoverage = coverage(measure.numerator, datasetIds.length)
    return {
      questionId: measure.questionId,
      sourceKey: measure.sourceKey,
      numerator: measure.numerator,
      denominator: datasetIds.length,
      coverage: observedCoverage,
      observedMaturity: maturityFromCoverage(observedCoverage),
      confidence: 85,
    }
  })

  const observedAt = new Date().toISOString()
  const { error: insertError } = await admin.schema('governance').from('maturity_assessment_observations').insert(
    observations.map(item => ({
      assessment_id: assessmentId,
      question_id: item.questionId,
      source_key: item.sourceKey,
      observed_maturity: item.observedMaturity,
      confidence: item.confidence,
      coverage: item.coverage,
      metadata: {
        numerator: item.numerator,
        denominator: item.denominator,
        scope: 'CURRENT_ORGANIZATION_DATASETS',
        observation_semantics: 'coverage_only_does_not_overwrite_declared_maturity',
      },
      observed_at: observedAt,
    })),
  )
  if (insertError) throw new Error(`Unable to persist maturity observations: ${insertError.message}`)

  return { observations, skipped: null }
}

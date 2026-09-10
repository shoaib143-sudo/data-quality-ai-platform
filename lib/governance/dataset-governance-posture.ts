import { createAdminClient } from '@/lib/supabase/admin'

type JsonRecord = Record<string, any>

function upper(value: unknown) {
  return typeof value === 'string' ? value.toUpperCase() : ''
}

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function ids(rows: JsonRecord[], key: string) {
  return [...new Set(rows.map((row) => String(row[key] ?? '')).filter(Boolean))]
}

function latestBy<T extends JsonRecord>(rows: T[], key: (row: T) => string, timeKey: string) {
  const result = new Map<string, T>()
  for (const row of rows) {
    const id = key(row)
    const existing = result.get(id)
    const nextTime = Date.parse(String(row[timeKey] ?? '')) || 0
    const currentTime = Date.parse(String(existing?.[timeKey] ?? '')) || 0
    if (!existing || nextTime > currentTime) result.set(id, row)
  }
  return result
}

function lifecycleMetadata(catalogRow: JsonRecord) {
  const metadata = record(catalogRow.metadata)
  return {
    retentionDays: typeof catalogRow.retention_days === 'number' ? catalogRow.retention_days : null,
    usagePurpose: typeof metadata.usage_purpose === 'string' ? metadata.usage_purpose : null,
    jurisdiction: typeof metadata.jurisdiction === 'string' ? metadata.jurisdiction : null,
    authoritativeSource: typeof metadata.authoritative_source === 'boolean' ? metadata.authoritative_source : null,
    privacyImpactAssessment: metadata.privacy_impact_assessment ?? null,
    accessControlEvidence: metadata.access_control_evidence ?? null,
  }
}

export async function loadDatasetGovernancePosture(projectId: string, datasetId: string) {
  if (!projectId.trim()) throw new Error('projectId is required')
  if (!datasetId.trim()) throw new Error('datasetId is required')

  const admin = createAdminClient()
  const datasetResult = await admin
    .schema('catalog')
    .from('datasets')
    .select('id, project_id, data_source_id, name, description, source_identifier, business_domain, status, metadata, created_at, updated_at')
    .eq('id', datasetId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (datasetResult.error) throw new Error(`Unable to load dataset: ${datasetResult.error.message}`)
  if (!datasetResult.data) throw new Error('Dataset was not found in the authorized project.')

  const [catalogResult, classificationResult, cdeMappingResult, stewardshipResult, glossaryMappingResult, controlBindingResult, contractResult, readinessResult, issueResult] = await Promise.all([
    admin.schema('governance').from('dataset_catalog').select('*').eq('project_id', projectId).eq('dataset_id', datasetId).maybeSingle(),
    admin.schema('governance').from('dataset_classifications').select('*').eq('project_id', projectId).eq('dataset_id', datasetId).eq('target_state', 'CURRENT').order('updated_at', { ascending: false }),
    admin.schema('governance').from('cde_mappings').select('*').eq('project_id', projectId).eq('dataset_id', datasetId).order('updated_at', { ascending: false }),
    admin.schema('governance').from('stewardship_assignments').select('*').eq('project_id', projectId).eq('dataset_id', datasetId).eq('target_state', 'CURRENT').order('updated_at', { ascending: false }),
    admin.schema('governance').from('glossary_mappings').select('*').eq('dataset_id', datasetId).order('updated_at', { ascending: false }),
    admin.schema('governance').from('control_scope_bindings').select('*').eq('project_id', projectId).eq('status', 'ACTIVE').eq('target_state', 'CURRENT').order('updated_at', { ascending: false }),
    admin.schema('governance').from('data_contracts').select('*').eq('project_id', projectId).eq('dataset_id', datasetId).order('updated_at', { ascending: false }),
    admin.schema('governance').from('certification_readiness').select('*').eq('project_id', projectId).eq('dataset_id', datasetId).maybeSingle(),
    admin.schema('governance').from('issues').select('*').eq('project_id', projectId).eq('dataset_id', datasetId).order('updated_at', { ascending: false }),
  ])

  const named = [
    ['dataset catalog', catalogResult],
    ['classifications', classificationResult],
    ['CDE mappings', cdeMappingResult],
    ['stewardship', stewardshipResult],
    ['glossary mappings', glossaryMappingResult],
    ['control bindings', controlBindingResult],
    ['contracts', contractResult],
    ['certification readiness', readinessResult],
    ['issues', issueResult],
  ] as const
  for (const [name, result] of named) if (result.error) throw new Error(`Unable to load ${name}: ${result.error.message}`)

  const classifications = array(classificationResult.data)
  const cdeMappings = array(cdeMappingResult.data)
  const stewardship = array(stewardshipResult.data)
  const glossaryMappings = array(glossaryMappingResult.data)
  const allBindings = array(controlBindingResult.data)
  const contracts = array(contractResult.data)
  const issues = array(issueResult.data)
  const catalog = record(catalogResult.data)

  const applicableBindings = allBindings.filter((binding) => {
    const scopeType = upper(binding.scope_type)
    return scopeType === 'PROJECT'
      || String(binding.scope_id ?? '') === datasetId
      || String(binding.scope_key ?? '') === datasetId
      || String(binding.catalog_identity_key ?? '') === datasetId
  })

  const labelIds = ids(classifications, 'label_id')
  const cdeIds = ids(cdeMappings, 'cde_id')
  const termIds = ids(glossaryMappings, 'term_id')
  const controlIds = ids(applicableBindings, 'control_id')
  const contractVersionIds = ids(contracts, 'current_version_id')

  const [labelsResult, cdesResult, termsResult, controlsResult, evaluationsResult, versionsResult] = await Promise.all([
    labelIds.length ? admin.schema('governance').from('classification_labels').select('*').eq('project_id', projectId).in('id', labelIds) : Promise.resolve({ data: [], error: null }),
    cdeIds.length ? admin.schema('governance').from('critical_data_elements').select('*').eq('project_id', projectId).in('id', cdeIds) : Promise.resolve({ data: [], error: null }),
    termIds.length ? admin.schema('governance').from('glossary_terms').select('*').eq('project_id', projectId).in('id', termIds) : Promise.resolve({ data: [], error: null }),
    controlIds.length ? admin.schema('governance').from('control_definitions').select('*').eq('project_id', projectId).in('id', controlIds) : Promise.resolve({ data: [], error: null }),
    controlIds.length ? admin.schema('governance').from('control_evaluations').select('*').eq('project_id', projectId).in('control_id', controlIds).order('evaluated_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    contractVersionIds.length ? admin.schema('governance').from('data_contract_versions').select('*').in('id', contractVersionIds) : Promise.resolve({ data: [], error: null }),
  ])

  for (const [name, result] of [
    ['classification labels', labelsResult], ['CDE definitions', cdesResult], ['glossary terms', termsResult],
    ['control definitions', controlsResult], ['control evaluations', evaluationsResult], ['contract versions', versionsResult],
  ] as const) if (result.error) throw new Error(`Unable to load ${name}: ${result.error.message}`)

  const labels = new Map(array(labelsResult.data).map((row) => [String(row.id), row]))
  const cdes = new Map(array(cdesResult.data).map((row) => [String(row.id), row]))
  const terms = new Map(array(termsResult.data).map((row) => [String(row.id), row]))
  const controls = new Map(array(controlsResult.data).map((row) => [String(row.id), row]))
  const contractVersions = new Map(array(versionsResult.data).map((row) => [String(row.id), row]))
  const latestEvaluations = latestBy(array(evaluationsResult.data), (row) => `${row.control_id}:${row.scope_binding_id ?? 'PROJECT'}`, 'evaluated_at')

  const classificationItems: JsonRecord[] = classifications.map((row): JsonRecord => ({ ...row, label: labels.get(String(row.label_id)) ?? null }))
  const authoritativeClassifications = classificationItems.filter((row) => upper(row.status) === 'APPROVED' && upper(row.authority_state) === 'AUTHORITATIVE' && upper(row.target_state) === 'CURRENT')
  const proposedClassifications = classificationItems.filter((row) => !authoritativeClassifications.includes(row))

  const cdeItems: JsonRecord[] = cdeMappings.map((row): JsonRecord => ({ ...row, cde: cdes.get(String(row.cde_id)) ?? null }))
  const approvedCdeMappings = cdeItems.filter((row) => ['APPROVED', 'ACTIVE'].includes(upper(row.status)))
  const proposedCdeMappings = cdeItems.filter((row) => !approvedCdeMappings.includes(row))

  const stewardshipItems = stewardship.filter((row) => row.active === true && upper(row.status) === 'ACTIVE' && upper(row.target_state) === 'CURRENT')
  const glossaryItems: JsonRecord[] = glossaryMappings.map((row): JsonRecord => ({ ...row, term: terms.get(String(row.term_id)) ?? null }))
  const approvedGlossaryMappings = glossaryItems.filter((row) => row.approved === true && upper(row.mapping_status) === 'APPROVED' && upper(row.validation_state) !== 'UNVERIFIED')
  const proposedGlossaryMappings = glossaryItems.filter((row) => !approvedGlossaryMappings.includes(row))

  const controlItems = applicableBindings.map((binding) => {
    const control = controls.get(String(binding.control_id)) ?? null
    const evaluation = latestEvaluations.get(`${binding.control_id}:${binding.id}`) ?? latestEvaluations.get(`${binding.control_id}:PROJECT`) ?? null
    const authoritative = Boolean(control && upper(control.lifecycle_status) === 'ACTIVE' && upper(control.review_status) === 'APPROVED' && upper(control.authority_class) !== 'UNVERIFIED')
    return { binding, control, latestEvaluation: evaluation, authoritative }
  })
  const authoritativeControls = controlItems.filter((item) => item.authoritative)
  const proposedControls = controlItems.filter((item) => !item.authoritative)

  const lifecycle = lifecycleMetadata(catalog)
  const highestSensitivity = authoritativeClassifications.reduce((max, item) => Math.max(max, Number(record(item.label).sensitivity_level ?? 0)), 0)
  const criticality = upper(catalog.criticality)
  const highGovernanceRisk = criticality === 'CRITICAL' || criticality === 'HIGH' || highestSensitivity >= 4
  const openIssues = issues.filter((issue) => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(upper(issue.status)))

  const gaps: Array<{ code: string; severity: 'INFO' | 'WARN' | 'HIGH'; reason: string }> = []
  if (proposedClassifications.length) gaps.push({ code: 'CLASSIFICATION_REVIEW_REQUIRED', severity: 'WARN', reason: `${proposedClassifications.length} current classification suggestion(s) are not authoritative.` })
  if (proposedCdeMappings.length) gaps.push({ code: 'CDE_REVIEW_REQUIRED', severity: 'WARN', reason: `${proposedCdeMappings.length} CDE mapping suggestion(s) are not approved.` })
  if (proposedGlossaryMappings.length) gaps.push({ code: 'GLOSSARY_REVIEW_REQUIRED', severity: 'WARN', reason: `${proposedGlossaryMappings.length} glossary mapping(s) are not approved and validated.` })
  if (highGovernanceRisk && stewardshipItems.length === 0) gaps.push({ code: 'ACCOUNTABILITY_REQUIRED', severity: 'HIGH', reason: 'High-risk dataset has no current active stewardship assignment.' })
  if (authoritativeControls.some((item) => !item.latestEvaluation)) gaps.push({ code: 'CONTROL_EVALUATION_MISSING', severity: 'HIGH', reason: 'At least one authoritative applicable control has no persisted evaluation.' })
  if (highGovernanceRisk && lifecycle.retentionDays === null) gaps.push({ code: 'RETENTION_UNDEFINED', severity: 'HIGH', reason: 'High-risk dataset has no dataset retention period.' })
  if (highGovernanceRisk && lifecycle.usagePurpose === null) gaps.push({ code: 'USAGE_PURPOSE_UNDEFINED', severity: 'WARN', reason: 'High-risk dataset has no declared usage purpose.' })
  if (highestSensitivity >= 4 && lifecycle.jurisdiction === null) gaps.push({ code: 'JURISDICTION_UNDEFINED', severity: 'WARN', reason: 'Sensitive dataset has no declared jurisdiction/sovereignty context.' })
  if (highestSensitivity >= 4 && lifecycle.accessControlEvidence === null) gaps.push({ code: 'ACCESS_CONTROL_EVIDENCE_MISSING', severity: 'HIGH', reason: 'Sensitive dataset has no linked access-control evidence.' })
  if (!readinessResult.data) gaps.push({ code: 'CERTIFICATION_READINESS_NOT_ASSESSED', severity: 'INFO', reason: 'Certification readiness has not been assessed for this dataset.' })

  return {
    projectId,
    datasetId,
    generatedAt: new Date().toISOString(),
    truthModel: {
      authoritativeFacts: 'APPROVED_CURRENT_GOVERNANCE_STATE',
      observedEvidence: 'PERSISTED_PROFILE_CONTROL_AND_LINEAGE_EVIDENCE',
      derivedIntelligence: 'NON_AUTHORITATIVE_UNLESS_GOVERNED_TRANSITION_COMPLETES',
      governedDecisions: 'DATABASE_ENFORCED_REVIEW_AND_APPROVAL_STATE',
    },
    dataset: datasetResult.data,
    catalog: catalogResult.data ?? null,
    lifecycle,
    classification: { authoritative: authoritativeClassifications, proposed: proposedClassifications, highestSensitivity },
    criticalDataElements: { approved: approvedCdeMappings, proposed: proposedCdeMappings },
    glossary: { approved: approvedGlossaryMappings, proposed: proposedGlossaryMappings },
    stewardship: { active: stewardshipItems },
    controls: { authoritative: authoritativeControls, proposed: proposedControls },
    contracts: contracts.map((contract) => ({ ...contract, currentVersion: contractVersions.get(String(contract.current_version_id)) ?? null })),
    certificationReadiness: readinessResult.data ?? null,
    issues: { open: openIssues, all: issues },
    gaps,
    summary: {
      criticality: catalog.criticality ?? null,
      highestSensitivity,
      authoritativeClassificationCount: authoritativeClassifications.length,
      approvedCdeCount: approvedCdeMappings.length,
      activeStewardshipCount: stewardshipItems.length,
      authoritativeControlCount: authoritativeControls.length,
      proposedControlCount: proposedControls.length,
      openIssueCount: openIssues.length,
      gapCount: gaps.length,
      highSeverityGapCount: gaps.filter((gap) => gap.severity === 'HIGH').length,
    },
  }
}

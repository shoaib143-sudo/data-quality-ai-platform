import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { assessProposedLineageChange } from '@/lib/governance/lineage-change-impact'

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

export async function assessGovernedLineageChange(input: {
  projectId: string
  datasetId: string
  changeType: string
  changeSummary?: string | null
  affectedColumns?: string[]
  maxDepth?: number
  maxEdges?: number
  actorUserId?: string | null
}) {
  const base = await assessProposedLineageChange(input)
  const admin = createAdminClient()

  const impactedDatasetIds = new Set<string>([input.datasetId])
  for (const node of array(base.datasetImpact?.nodes)) {
    if (upper(node.assetType) === 'DATASET' && node.assetId) impactedDatasetIds.add(String(node.assetId))
  }

  const columnAssetIds = array(base.columnImpact?.nodes).map((node) => String(node.assetId ?? '')).filter(Boolean)
  if (columnAssetIds.length) {
    const { data: columnAssets, error } = await admin.schema('governance').from('lineage_assets')
      .select('id,dataset_id').eq('project_id', input.projectId).in('id', columnAssetIds)
    if (error) throw new Error(`Unable to resolve impacted field-lineage datasets: ${error.message}`)
    for (const asset of columnAssets ?? []) if (asset.dataset_id) impactedDatasetIds.add(String(asset.dataset_id))
  }

  const datasetIds = [...impactedDatasetIds]
  const [catalogResult, cdeMappingResult, dqRuleResult, contractResult, stewardshipResult, certificationResult, bindingResult] = await Promise.all([
    admin.schema('governance').from('dataset_catalog').select('*').eq('project_id', input.projectId).in('dataset_id', datasetIds),
    admin.schema('governance').from('cde_mappings').select('*').eq('project_id', input.projectId).in('dataset_id', datasetIds),
    admin.schema('profiling').from('quality_rule_definitions').select('*').eq('project_id', input.projectId).in('dataset_id', datasetIds),
    admin.schema('governance').from('data_contracts').select('*').eq('project_id', input.projectId).in('dataset_id', datasetIds),
    admin.schema('governance').from('stewardship_assignments').select('*').eq('project_id', input.projectId).in('dataset_id', datasetIds).eq('target_state', 'CURRENT'),
    admin.schema('governance').from('certification_readiness').select('*').eq('project_id', input.projectId).in('dataset_id', datasetIds),
    admin.schema('governance').from('control_scope_bindings').select('*').eq('project_id', input.projectId).eq('status', 'ACTIVE').eq('target_state', 'CURRENT'),
  ])

  for (const [name, result] of [
    ['catalog governance', catalogResult], ['CDE mappings', cdeMappingResult], ['DQ rules', dqRuleResult],
    ['contracts', contractResult], ['stewardship', stewardshipResult], ['certification readiness', certificationResult], ['control bindings', bindingResult],
  ] as const) if (result.error) throw new Error(`Unable to resolve ${name} for lineage change: ${result.error.message}`)

  const cdeMappings = array(cdeMappingResult.data)
  const cdeIds = [...new Set(cdeMappings.map((row) => String(row.cde_id ?? '')).filter(Boolean))]
  const bindingRows = array(bindingResult.data).filter((binding) => {
    if (upper(binding.scope_type) === 'PROJECT') return true
    return datasetIds.includes(String(binding.scope_id ?? '')) || datasetIds.includes(String(binding.scope_key ?? '')) || datasetIds.includes(String(binding.catalog_identity_key ?? ''))
  })
  const controlIds = [...new Set(bindingRows.map((row) => String(row.control_id ?? '')).filter(Boolean))]

  const [cdeResult, controlResult] = await Promise.all([
    cdeIds.length ? admin.schema('governance').from('critical_data_elements').select('*').eq('project_id', input.projectId).in('id', cdeIds) : Promise.resolve({ data: [], error: null }),
    controlIds.length ? admin.schema('governance').from('control_definitions').select('*').eq('project_id', input.projectId).in('id', controlIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (cdeResult.error) throw new Error(`Unable to resolve CDE definitions for lineage change: ${cdeResult.error.message}`)
  if (controlResult.error) throw new Error(`Unable to resolve control definitions for lineage change: ${controlResult.error.message}`)

  const cdeById = new Map(array(cdeResult.data).map((row) => [String(row.id), row]))
  const controlById = new Map(array(controlResult.data).map((row) => [String(row.id), row]))
  const cdeImpact: JsonRecord[] = cdeMappings.map((mapping): JsonRecord => ({ ...mapping, cde: cdeById.get(String(mapping.cde_id)) ?? null }))
  const authoritativeCdeImpact = cdeImpact.filter((row) => ['APPROVED', 'ACTIVE'].includes(upper(row.status)))
  const proposedCdeImpact = cdeImpact.filter((row) => !authoritativeCdeImpact.includes(row))

  const dqRules = array(dqRuleResult.data)
  const authoritativeDqRules = dqRules.filter((rule) => rule.enabled === true && upper(rule.approval_status) === 'APPROVED')
  const contracts = array(contractResult.data)
  const activeContracts = contracts.filter((contract) => ['ACTIVE', 'APPROVED'].includes(upper(contract.status)))
  const stewardship = array(stewardshipResult.data).filter((row) => row.active === true && upper(row.status) === 'ACTIVE')
  const catalog = array(catalogResult.data)
  const certifiedDatasets = catalog.filter((row) => upper(row.certification_status) === 'CERTIFIED')
  const highCriticalDatasets = catalog.filter((row) => ['HIGH', 'CRITICAL'].includes(upper(row.criticality)))
  const controls = bindingRows.map((binding) => ({ binding, control: controlById.get(String(binding.control_id)) ?? null }))
  const authoritativeControls = controls.filter(({ control }) => control && upper(control.lifecycle_status) === 'ACTIVE' && upper(control.review_status) === 'APPROVED' && upper(control.authority_class) !== 'UNVERIFIED')

  const blockingReasons: Array<{ code: string; level: 'REVIEW' | 'APPROVAL'; reason: string }> = []
  if (base.scopeLimited) blockingReasons.push({ code: 'LINEAGE_SCOPE_LIMITED', level: 'REVIEW', reason: 'Bounded graph scope was reached, so the impact set is not complete-estate proof.' })
  if (base.affectedCount === 0 && (base.columnAffectedCount ?? 0) === 0) blockingReasons.push({ code: 'LINEAGE_EVIDENCE_INCOMPLETE', level: 'REVIEW', reason: 'No downstream dependency is proven; absence of lineage is not proof of no impact.' })
  if (certifiedDatasets.length) blockingReasons.push({ code: 'CERTIFIED_DATASET_IMPACT', level: 'APPROVAL', reason: `${certifiedDatasets.length} certified dataset(s) are in the impacted set.` })
  if (authoritativeCdeImpact.some((row) => upper(record(row.cde).criticality) === 'CRITICAL')) blockingReasons.push({ code: 'CRITICAL_CDE_IMPACT', level: 'APPROVAL', reason: 'At least one approved critical CDE mapping is in the impacted set.' })
  if (activeContracts.length && ['DROP_DATASET', 'DROP_COLUMN', 'RENAME_COLUMN', 'TYPE_CHANGE', 'TYPE_NARROWING', 'PIPELINE_BREAKING_CHANGE'].includes(base.changeType)) blockingReasons.push({ code: 'CONTRACT_REVIEW_REQUIRED', level: 'APPROVAL', reason: `${activeContracts.length} active/approved contract(s) may be affected by the proposed structural change.` })
  if (authoritativeDqRules.some((rule) => ['HIGH', 'CRITICAL'].includes(upper(rule.severity)))) blockingReasons.push({ code: 'HIGH_SEVERITY_DQ_CONTROL_IMPACT', level: 'REVIEW', reason: 'High/critical approved DQ controls exist on impacted datasets.' })
  if (highCriticalDatasets.some((dataset) => !stewardship.some((row) => String(row.dataset_id) === String(dataset.dataset_id)))) blockingReasons.push({ code: 'IMPACT_OWNER_GAP', level: 'REVIEW', reason: 'At least one high/critical impacted dataset has no current active steward assignment.' })

  const requiresApproval = base.approvalRequired || blockingReasons.some((reason) => reason.level === 'APPROVAL')
  const requiresReview = blockingReasons.length > 0
  const decision = requiresApproval ? 'APPROVAL_REQUIRED' : requiresReview || base.decision === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : base.decision

  const { data: persisted, error: persistedError } = await admin.schema('governance').from('lineage_impact_analyses')
    .select('evidence').eq('id', base.analysisId).eq('project_id', input.projectId).maybeSingle()
  if (persistedError || !persisted) throw new Error(`Unable to load persisted lineage analysis for governance enrichment: ${persistedError?.message ?? 'not found'}`)
  const evidence = record(persisted.evidence)
  const proposedChange = record(evidence.proposed_change)
  const governanceImpact = {
    impacted_dataset_ids: datasetIds,
    authoritative_cde_mapping_count: authoritativeCdeImpact.length,
    proposed_cde_mapping_count: proposedCdeImpact.length,
    authoritative_dq_rule_count: authoritativeDqRules.length,
    active_contract_count: activeContracts.length,
    certified_dataset_count: certifiedDatasets.length,
    authoritative_control_count: authoritativeControls.length,
    active_stewardship_count: stewardship.length,
    certification_readiness: certificationResult.data ?? [],
    blocking_reasons: blockingReasons,
    assessed_at: new Date().toISOString(),
  }
  const { error: updateError } = await admin.schema('governance').from('lineage_impact_analyses').update({
    evidence: {
      ...evidence,
      proposed_change: { ...proposedChange, decision, approval_required: requiresApproval },
      governance_impact: governanceImpact,
    },
    updated_at: new Date().toISOString(),
  }).eq('id', base.analysisId).eq('project_id', input.projectId)
  if (updateError) throw new Error(`Unable to persist governance-enriched lineage impact: ${updateError.message}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'AGENT',
    eventType: 'LINEAGE_CHANGE_GOVERNANCE_IMPACT_ASSESSED',
    entityType: 'DATASET',
    entityId: input.datasetId,
    metadata: {
      analysis_id: base.analysisId,
      decision,
      approval_required: requiresApproval,
      impacted_dataset_count: datasetIds.length,
      blocking_reasons: blockingReasons.map((reason) => reason.code),
      production_mutation_performed: false,
    },
  })

  return {
    ...base,
    decision,
    approvalRequired: requiresApproval,
    productionMutationPerformed: false as const,
    governanceImpact: {
      impactedDatasetIds: datasetIds,
      authoritativeCdeImpact,
      proposedCdeImpact,
      authoritativeDqRules,
      activeContracts,
      certifiedDatasets,
      stewardship,
      authoritativeControls,
      certificationReadiness: certificationResult.data ?? [],
      blockingReasons,
    },
  }
}

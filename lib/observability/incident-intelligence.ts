import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

type Alert = {
  id: string
  category: string
  severity: Severity
  title: string
  description: string
  evidence: Record<string, unknown>
  status: string
  first_observed_at: string
  last_observed_at: string
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function severityRank(value: unknown) {
  const ranks: Record<string, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }
  return ranks[text(value).toUpperCase()] ?? 0
}
function severityFromRank(rank: number): Severity {
  return (['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.max(0, Math.min(4, rank))] ?? 'INFO') as Severity
}

function correlatedSeverity(alerts: Alert[]) {
  const base = Math.max(0, ...alerts.map((alert) => severityRank(alert.severity)))
  const highSignals = alerts.filter((alert) => severityRank(alert.severity) >= 3).length
  const correlatedEscalation = alerts.length >= 3 || highSignals >= 2 ? 1 : 0
  return severityFromRank(Math.min(4, base + correlatedEscalation))
}

function rootCauses(alerts: Alert[]) {
  const categories = new Set(alerts.map((alert) => alert.category))
  const causes: Array<Record<string, unknown>> = []

  if (categories.has('SCHEMA_DRIFT') && categories.has('QUALITY_RULE_FAILURE')) {
    causes.push({ cause: 'SCHEMA_CHANGE_AFFECTING_QUALITY_CONTROLS', confidence: 0.9, evidence_categories: ['SCHEMA_DRIFT', 'QUALITY_RULE_FAILURE'] })
  }
  if (categories.has('QUALITY_SCORE_DROP') && categories.has('QUALITY_RULE_FAILURE')) {
    causes.push({ cause: 'MATERIAL_DATA_QUALITY_DEGRADATION', confidence: 0.9, evidence_categories: ['QUALITY_SCORE_DROP', 'QUALITY_RULE_FAILURE'] })
  }
  if (categories.has('FRESHNESS') && categories.has('VOLUME_CHANGE')) {
    causes.push({ cause: 'INGESTION_DELAY_OR_PARTIAL_LOAD', confidence: 0.82, evidence_categories: ['FRESHNESS', 'VOLUME_CHANGE'] })
  }
  if (categories.has('PROFILE_FAILURE')) {
    causes.push({ cause: 'PROFILING_OR_SOURCE_EXECUTION_FAILURE', confidence: 0.78, evidence_categories: ['PROFILE_FAILURE'] })
  }
  if (categories.has('SCHEMA_DRIFT') && !causes.some((cause) => cause.cause === 'SCHEMA_CHANGE_AFFECTING_QUALITY_CONTROLS')) {
    causes.push({ cause: 'UNREVIEWED_SCHEMA_CHANGE', confidence: 0.76, evidence_categories: ['SCHEMA_DRIFT'] })
  }
  if (categories.has('VOLUME_CHANGE') && !categories.has('FRESHNESS')) {
    causes.push({ cause: 'VOLUME_ANOMALY_OR_BACKFILL', confidence: 0.68, evidence_categories: ['VOLUME_CHANGE'] })
  }
  if (categories.has('QUALITY_RULE_FAILURE') && !causes.some((cause) => cause.cause === 'MATERIAL_DATA_QUALITY_DEGRADATION')) {
    causes.push({ cause: 'GOVERNED_QUALITY_CONTROL_BREACH', confidence: 0.8, evidence_categories: ['QUALITY_RULE_FAILURE'] })
  }
  if (!causes.length) causes.push({ cause: 'OBSERVABILITY_SIGNAL_DEGRADATION', confidence: 0.6, evidence_categories: [...categories] })
  return causes
}

function recommendations(alerts: Alert[], severity: Severity) {
  const categories = new Set(alerts.map((alert) => alert.category))
  const rows: Array<Record<string, unknown>> = []
  const add = (action: string, rationale: string, approvalRequired = false, priority: Severity = severity) => {
    if (!rows.some((row) => row.action === action)) rows.push({ action, rationale, approval_required: approvalRequired, priority })
  }

  if (categories.has('QUALITY_RULE_FAILURE')) add('route_to_data_quality_remediation', 'Use the governed Data Quality remediation workflow and verify the failed controls after remediation.', false, 'HIGH')
  if (categories.has('QUALITY_SCORE_DROP')) add('compare_quality_regression_evidence', 'Compare the latest and prior profiling evidence to isolate which dimensions and controls drove the quality regression.', false, 'MEDIUM')
  if (categories.has('SCHEMA_DRIFT')) add('review_schema_change_impact_before_release', 'Assess downstream lineage, contracts and compatibility before accepting the schema change.', true, severityRank(severity) >= 4 ? 'CRITICAL' : 'HIGH')
  if (categories.has('VOLUME_CHANGE')) add('investigate_ingestion_volume_anomaly', 'Validate source extracts, filters, backfills and partition completeness before changing volume thresholds.', false, 'MEDIUM')
  if (categories.has('FRESHNESS')) add('restore_data_freshness_sla', 'Inspect the producing schedule and source availability, then restore freshness before dependent consumers rely on the asset.', severityRank(severity) >= 4, 'HIGH')
  if (categories.has('PROFILE_FAILURE')) add('restore_profiling_execution_path', 'Inspect connector health, credentials, execution-source configuration and worker evidence before retrying profiling.', false, 'HIGH')

  if (severityRank(severity) >= 4) add('approve_critical_incident_response', 'Critical correlated incidents require an explicit governed response decision before production-affecting remediation.', true, 'CRITICAL')
  return rows
}

async function ensureIncidentApproval(input: {
  projectId: string
  userId: string | null
  incidentId: string
  datasetId: string
  recommendations: Array<Record<string, unknown>>
  evidence: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const workflowKey = 'OBSERVABILITY_INCIDENT_RESPONSE_APPROVAL'
  let { data: definition, error: definitionError } = await admin.schema('governance').from('workflow_definitions')
    .select('id,workflow_key,version')
    .eq('project_id', input.projectId)
    .eq('workflow_key', workflowKey)
    .eq('entity_type', 'OBSERVABILITY_INCIDENT')
    .eq('enabled', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (definitionError) throw new Error(`Unable to resolve observability approval workflow: ${definitionError.message}`)

  if (!definition) {
    const created = await admin.schema('governance').from('workflow_definitions').insert({
      project_id: input.projectId,
      workflow_key: workflowKey,
      name: 'Critical observability incident response',
      entity_type: 'OBSERVABILITY_INCIDENT',
      version: 1,
      steps: [{ index: 0, name: 'Incident response approval', capability: 'policy.approve', description: 'Review correlated operational evidence, business impact and proposed governed response.' }],
      enabled: true,
      created_by: input.userId,
    }).select('id,workflow_key,version').single()
    if (created.error || !created.data) {
      const raced = await admin.schema('governance').from('workflow_definitions').select('id,workflow_key,version')
        .eq('project_id', input.projectId).eq('workflow_key', workflowKey).eq('entity_type', 'OBSERVABILITY_INCIDENT').eq('enabled', true).order('version', { ascending: false }).limit(1).maybeSingle()
      if (raced.error || !raced.data) throw new Error(`Unable to provision observability approval workflow: ${created.error?.message ?? raced.error?.message ?? 'unknown error'}`)
      definition = raced.data
    } else {
      definition = created.data
    }
  }

  const existing = await admin.schema('governance').from('workflow_instances').select('id,status')
    .eq('workflow_definition_id', definition.id).eq('entity_type', 'OBSERVABILITY_INCIDENT').eq('entity_id', input.incidentId)
    .in('status', ['RUNNING', 'APPROVED']).order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (existing.error) throw new Error(`Unable to resolve observability approval instance: ${existing.error.message}`)
  if (existing.data) return { instanceId: existing.data.id as string, status: existing.data.status as string, reused: true }

  const responseRecommendations = input.recommendations.filter((item) => item.approval_required === true)
  const started = await admin.schema('governance').rpc('start_workflow', {
    p_definition_id: definition.id,
    p_entity_type: 'OBSERVABILITY_INCIDENT',
    p_entity_id: input.incidentId,
    p_started_by: input.userId,
    p_context: {
      source: 'OBSERVABILITY_INCIDENT_INTELLIGENCE',
      incident_id: input.incidentId,
      dataset_id: input.datasetId,
      recommendations: responseRecommendations,
      evidence: input.evidence,
    },
  })
  if (started.error || !started.data) throw new Error(`Unable to start observability incident approval: ${started.error?.message ?? 'unknown error'}`)
  return { instanceId: String(started.data), status: 'RUNNING', reused: false }
}

export async function investigateObservabilityIncident(input: {
  datasetVersionId: string
  profileRunId?: string | null
  userId?: string | null
}) {
  const admin = createAdminClient()
  const userId = input.userId?.trim() || null

  const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').eq('id', input.datasetVersionId).maybeSingle()
  if (versionError || !version) throw new Error(`Unable to resolve observability dataset version: ${versionError?.message ?? 'not found'}`)
  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,project_id,name').eq('id', version.dataset_id).maybeSingle()
  if (datasetError || !dataset) throw new Error(`Unable to resolve observability dataset: ${datasetError?.message ?? 'not found'}`)

  const { data: alerts, error: alertsError } = await admin.schema('profiling').from('observability_alerts')
    .select('id,category,severity,title,description,evidence,status,first_observed_at,last_observed_at')
    .eq('project_id', dataset.project_id).eq('dataset_id', dataset.id).neq('status', 'RESOLVED').order('last_observed_at', { ascending: false })
  if (alertsError) throw new Error(`Unable to load active observability signals: ${alertsError.message}`)
  const activeAlerts = (alerts ?? []) as Alert[]

  const existing = await admin.schema('governance').from('observability_incidents').select('id,status,workflow_instance_id')
    .eq('project_id', dataset.project_id).eq('dataset_id', dataset.id).neq('status', 'RESOLVED').limit(1).maybeSingle()
  if (existing.error) throw new Error(`Unable to resolve existing observability incident: ${existing.error.message}`)

  if (!activeAlerts.length) {
    if (existing.data) {
      const now = new Date().toISOString()
      await admin.schema('governance').from('observability_incidents').update({ status: 'RESOLVED', resolved_at: now, last_observed_at: now, updated_at: now }).eq('id', existing.data.id)
      await writeGovernanceAudit({ projectId: dataset.project_id, actorUserId: userId, actorType: userId ? 'USER' : 'SYSTEM', eventType: 'OBSERVABILITY_INCIDENT_RESOLVED', entityType: 'OBSERVABILITY_INCIDENT', entityId: existing.data.id, metadata: { dataset_id: dataset.id, resolution: 'ALL_CORRELATED_ALERTS_RESOLVED' } })
    }
    return { datasetId: dataset.id, incidentId: existing.data?.id ?? null, status: 'RESOLVED', activeAlertCount: 0 }
  }

  const severity = correlatedSeverity(activeAlerts)
  const causes = rootCauses(activeAlerts)
  const incidentRecommendations = recommendations(activeAlerts, severity)
  const approvalRequired = incidentRecommendations.some((row) => row.approval_required === true)
  const categories = [...new Set(activeAlerts.map((alert) => alert.category))]
  const confidence = Math.min(0.95, 0.62 + Math.min(activeAlerts.length, 4) * 0.07 + (causes.length > 1 ? 0.05 : 0))
  const summary = `${activeAlerts.length} active observability signal${activeAlerts.length === 1 ? '' : 's'} correlate across ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} for ${dataset.name}. Highest correlated severity is ${severity}.`
  const evidence = {
    dataset_version_id: input.datasetVersionId,
    profile_run_id: input.profileRunId ?? null,
    alert_ids: activeAlerts.map((alert) => alert.id),
    categories,
    alerts: activeAlerts.map((alert) => ({ id: alert.id, category: alert.category, severity: alert.severity, title: alert.title, evidence: alert.evidence })),
  }

  const now = new Date().toISOString()
  let incidentId: string
  if (existing.data) {
    const update = await admin.schema('governance').from('observability_incidents').update({
      status: 'INVESTIGATING', severity, title: `${dataset.name} correlated operational incident`, summary,
      probable_root_causes: causes,
      business_impact: 'Correlated freshness, schema, volume, profiling or quality failures can affect downstream analytics, controls, reporting and operational decisions.',
      risk: { severity, active_alert_count: activeAlerts.length, categories },
      recommendations: incidentRecommendations,
      confidence,
      approval_required: approvalRequired,
      evidence,
      last_observed_at: now,
      updated_at: now,
      resolved_at: null,
    }).eq('id', existing.data.id).select('id').single()
    if (update.error || !update.data) throw new Error(`Unable to update observability incident: ${update.error?.message ?? 'unknown error'}`)
    incidentId = update.data.id
  } else {
    const insert = await admin.schema('governance').from('observability_incidents').insert({
      project_id: dataset.project_id,
      dataset_id: dataset.id,
      status: 'INVESTIGATING', severity,
      title: `${dataset.name} correlated operational incident`,
      summary,
      probable_root_causes: causes,
      business_impact: 'Correlated freshness, schema, volume, profiling or quality failures can affect downstream analytics, controls, reporting and operational decisions.',
      risk: { severity, active_alert_count: activeAlerts.length, categories },
      recommendations: incidentRecommendations,
      confidence,
      approval_required: approvalRequired,
      evidence,
      first_observed_at: activeAlerts.map((alert) => alert.first_observed_at).sort()[0] ?? now,
      last_observed_at: now,
      updated_at: now,
    }).select('id').single()
    if (insert.error || !insert.data) throw new Error(`Unable to create observability incident: ${insert.error?.message ?? 'unknown error'}`)
    incidentId = insert.data.id
  }

  const links = activeAlerts.map((alert) => ({ incident_id: incidentId, alert_id: alert.id }))
  if (links.length) {
    const linked = await admin.schema('governance').from('observability_incident_alerts').upsert(links, { onConflict: 'incident_id,alert_id', ignoreDuplicates: true })
    if (linked.error) throw new Error(`Unable to correlate observability alerts to incident: ${linked.error.message}`)
  }

  let workflow: { instanceId: string; status: string; reused: boolean } | null = null
  if (approvalRequired) {
    workflow = await ensureIncidentApproval({ projectId: dataset.project_id, userId, incidentId, datasetId: dataset.id, recommendations: incidentRecommendations, evidence })
    await admin.schema('governance').from('observability_incidents').update({ workflow_instance_id: workflow.instanceId, updated_at: new Date().toISOString() }).eq('id', incidentId)
  }

  await writeGovernanceAudit({
    projectId: dataset.project_id,
    actorUserId: userId,
    actorType: userId ? 'USER' : 'AGENT',
    eventType: 'OBSERVABILITY_INCIDENT_INVESTIGATED',
    entityType: 'OBSERVABILITY_INCIDENT',
    entityId: incidentId,
    correlationId: workflow?.instanceId ?? null,
    metadata: { dataset_id: dataset.id, dataset_version_id: input.datasetVersionId, profile_run_id: input.profileRunId ?? null, severity, categories, active_alert_count: activeAlerts.length, approval_required: approvalRequired },
  })

  return { incidentId, datasetId: dataset.id, projectId: dataset.project_id, severity, status: 'INVESTIGATING', activeAlertCount: activeAlerts.length, categories, probableRootCauses: causes, recommendations: incidentRecommendations, approvalRequired, workflow }
}

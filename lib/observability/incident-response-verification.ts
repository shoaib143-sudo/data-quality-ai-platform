import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function uuidList(value: unknown) { return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [] }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

export async function verifyObservabilityIncidentResponse(input: {
  incidentId: string
  actorUserId?: string | null
  verificationSource?: string
}) {
  const admin = createAdminClient()
  const actorUserId = input.actorUserId?.trim() || null
  const verificationSource = input.verificationSource?.trim() || 'AUTOMATIC'

  const { data: incident, error: incidentError } = await admin.schema('governance').from('observability_incidents')
    .select('id,project_id,dataset_id,status,evidence,resolved_at')
    .eq('id', input.incidentId)
    .maybeSingle()
  if (incidentError || !incident) throw new Error(`Unable to load observability incident for response verification: ${incidentError?.message ?? 'not found'}`)

  const evidence = object(incident.evidence)
  const issueIds = uuidList(evidence.remediation_issue_ids)
  const { data: issues, error: issuesError } = issueIds.length
    ? await admin.schema('governance').from('issues').select('id,status,resolution_summary,resolution_evidence,resolved_at').in('id', issueIds)
    : { data: [], error: null }
  if (issuesError) throw new Error(`Unable to load observability response issues: ${issuesError.message}`)

  const allIssuesPresent = issueIds.length === 0 || (issues ?? []).length === issueIds.length
  const issuesResolved = allIssuesPresent && (issues ?? []).every((issue) => ['RESOLVED', 'CLOSED'].includes(text(issue.status).toUpperCase()))
  const resolvedWithEvidence = issueIds.length === 0 || (issues ?? []).every((issue) => text(issue.resolution_summary).length > 0)

  const { data: links, error: linksError } = await admin.schema('governance').from('observability_incident_alerts')
    .select('alert_id')
    .eq('incident_id', incident.id)
  if (linksError) throw new Error(`Unable to load correlated incident alerts: ${linksError.message}`)
  const alertIds = (links ?? []).map((row) => text(row.alert_id)).filter(Boolean)

  const { data: alerts, error: alertsError } = alertIds.length
    ? await admin.schema('profiling').from('observability_alerts').select('id,status,category,severity,last_observed_at').in('id', alertIds)
    : { data: [], error: null }
  if (alertsError) throw new Error(`Unable to load observability response signals: ${alertsError.message}`)

  const activeAlerts = (alerts ?? []).filter((alert) => text(alert.status).toUpperCase() !== 'RESOLVED')
  const linkedAlertsPresent = alertIds.length > 0 && (alerts ?? []).length === alertIds.length
  const signalsCleared = linkedAlertsPresent && activeAlerts.length === 0
  const verificationPassed = issuesResolved && resolvedWithEvidence && signalsCleared
  const now = new Date().toISOString()
  const checks = {
    tracked_response_issues_resolved: { passed: issuesResolved, expected: issueIds.length, resolved: (issues ?? []).filter((issue) => ['RESOLVED', 'CLOSED'].includes(text(issue.status).toUpperCase())).length },
    response_resolution_evidence_present: { passed: resolvedWithEvidence, expected: issueIds.length, evidenced: (issues ?? []).filter((issue) => text(issue.resolution_summary).length > 0).length },
    correlated_alerts_present: { passed: linkedAlertsPresent, expected: alertIds.length, loaded: (alerts ?? []).length },
    correlated_signals_cleared: { passed: signalsCleared, active_alert_ids: activeAlerts.map((alert) => alert.id), active_alert_count: activeAlerts.length },
  }

  const nextStatus = verificationPassed ? 'RESOLVED' : (issueIds.length ? 'MITIGATING' : 'INVESTIGATING')
  const responseVerification = {
    passed: verificationPassed,
    verification_source: verificationSource,
    verified_at: now,
    checks,
    issue_ids: issueIds,
    alert_ids: alertIds,
  }

  const { error: updateError } = await admin.schema('governance').from('observability_incidents').update({
    status: nextStatus,
    resolved_at: verificationPassed ? now : null,
    last_observed_at: now,
    updated_at: now,
    evidence: {
      ...evidence,
      response_verification: responseVerification,
    },
  }).eq('id', incident.id)
  if (updateError) throw new Error(`Unable to persist observability response verification: ${updateError.message}`)

  await writeGovernanceAudit({
    projectId: incident.project_id,
    actorUserId,
    actorType: actorUserId ? 'USER' : 'SYSTEM',
    eventType: verificationPassed ? 'OBSERVABILITY_INCIDENT_RESPONSE_VERIFIED' : 'OBSERVABILITY_INCIDENT_RESPONSE_VERIFICATION_PENDING',
    entityType: 'OBSERVABILITY_INCIDENT',
    entityId: incident.id,
    metadata: {
      dataset_id: incident.dataset_id,
      verification_source: verificationSource,
      verification_passed: verificationPassed,
      checks,
    },
  })

  return {
    incidentId: incident.id,
    status: nextStatus,
    verificationPassed,
    checks,
  }
}

export async function verifyObservabilityIncidentResponseFromIssue(input: {
  issueId: string
  projectId: string
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const { data: incident, error: incidentError } = await admin.schema('governance').from('observability_incidents')
    .select('id')
    .eq('project_id', input.projectId)
    .contains('evidence', { remediation_issue_ids: [input.issueId] })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (incidentError) throw new Error(`Unable to resolve observability incident from response issue: ${incidentError.message}`)
  if (!incident) return { status: 'NOT_OBSERVABILITY_RESPONSE' as const }

  return verifyObservabilityIncidentResponse({
    incidentId: incident.id,
    actorUserId: input.actorUserId ?? null,
    verificationSource: 'ISSUE_RESOLUTION',
  })
}

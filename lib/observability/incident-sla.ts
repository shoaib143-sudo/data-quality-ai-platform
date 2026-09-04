import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { queueAlertNotifications } from '@/lib/observability/notifications'

type Incident = {
  id: string
  project_id: string
  dataset_id: string
  severity: string
  title: string
  status: string
  response_due_at: string | null
  escalation_level: number
  last_escalated_at: string | null
  evidence: unknown
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function cooldownMinutes(level: number) { return level <= 0 ? 0 : level === 1 ? 60 : level === 2 ? 120 : 240 }
function alertSeverity(value: string) { const severity=value.toUpperCase(); return severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH' }

export async function evaluateIncidentSlaEscalations(limit = 50) {
  const admin = createAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const { data, error } = await admin.schema('governance').from('observability_incidents')
    .select('id,project_id,dataset_id,severity,title,status,response_due_at,escalation_level,last_escalated_at,evidence')
    .neq('status', 'RESOLVED')
    .not('response_due_at', 'is', null)
    .lte('response_due_at', nowIso)
    .order('response_due_at', { ascending: true })
    .limit(Math.max(1, Math.min(200, limit)))
  if (error) throw new Error(`Unable to load overdue observability incidents: ${error.message}`)

  const results: Array<Record<string, unknown>> = []
  for (const incident of (data ?? []) as Incident[]) {
    const level = Number(incident.escalation_level ?? 0)
    const lastEscalatedAt = incident.last_escalated_at ? new Date(incident.last_escalated_at).getTime() : 0
    const cooldown = cooldownMinutes(level) * 60_000
    if (lastEscalatedAt && now.getTime() - lastEscalatedAt < cooldown) continue

    const nextLevel = Math.min(3, level + 1)
    const overdueMinutes = Math.max(0, Math.floor((now.getTime() - new Date(incident.response_due_at!).getTime()) / 60_000))
    const fingerprint = `incident-sla:${incident.id}:level:${nextLevel}`
    const severity = alertSeverity(incident.severity)
    const title = `Incident response SLA breached: ${incident.title}`
    const description = `Observability incident ${incident.id} is ${overdueMinutes} minutes overdue for governed response. Escalation level ${nextLevel}.`
    const alertEvidence = {
      incident_id: incident.id,
      incident_status: incident.status,
      response_due_at: incident.response_due_at,
      overdue_minutes: overdueMinutes,
      escalation_level: nextLevel,
      source: 'OBSERVABILITY_INCIDENT_SLA',
    }

    const { data: alert, error: alertError } = await admin.schema('profiling').from('observability_alerts').upsert({
      project_id: incident.project_id,
      dataset_id: incident.dataset_id,
      dataset_version_id: null,
      profile_run_id: null,
      category: 'INCIDENT_SLA_BREACH',
      severity,
      title,
      description,
      fingerprint,
      evidence: alertEvidence,
      status: 'OPEN',
      first_observed_at: nowIso,
      last_observed_at: nowIso,
      resolved_at: null,
      updated_at: nowIso,
    }, { onConflict: 'project_id,fingerprint' }).select('id').single()
    if (alertError || !alert) throw new Error(`Unable to persist incident SLA alert: ${alertError?.message ?? 'unknown error'}`)

    const evidence = object(incident.evidence)
    const { error: incidentUpdateError } = await admin.schema('governance').from('observability_incidents').update({
      escalation_level: nextLevel,
      last_escalated_at: nowIso,
      evidence: {
        ...evidence,
        sla: {
          response_due_at: incident.response_due_at,
          overdue: true,
          overdue_minutes: overdueMinutes,
          escalation_level: nextLevel,
          last_escalated_at: nowIso,
          alert_id: alert.id,
        },
      },
      updated_at: nowIso,
    }).eq('id', incident.id)
    if (incidentUpdateError) throw new Error(`Unable to persist incident SLA escalation state: ${incidentUpdateError.message}`)

    const deliveries = await queueAlertNotifications(alert.id)
    await writeGovernanceAudit({
      projectId: incident.project_id,
      actorUserId: null,
      actorType: 'SYSTEM',
      eventType: 'OBSERVABILITY_INCIDENT_SLA_ESCALATED',
      entityType: 'OBSERVABILITY_INCIDENT',
      entityId: incident.id,
      metadata: { alert_id: alert.id, response_due_at: incident.response_due_at, overdue_minutes: overdueMinutes, escalation_level: nextLevel, notification_delivery_count: deliveries.length },
    })
    results.push({ incidentId: incident.id, alertId: alert.id, escalationLevel: nextLevel, overdueMinutes, notifications: deliveries.length })
  }

  return results
}

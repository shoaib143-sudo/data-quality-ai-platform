import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

type Incident = {
  id: string
  dataset_id: string
  severity: string
  probable_root_causes: unknown
  evidence: unknown
  first_observed_at: string
  last_observed_at: string
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function stringSet(value: unknown) { return new Set(Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []) }
function causes(value: unknown) {
  return new Set(Array.isArray(value) ? value.map((item) => text(object(item).cause)).filter(Boolean) : [])
}
function intersection(a: Set<string>, b: Set<string>) { return [...a].filter((item) => b.has(item)) }
function clamp(value: number) { return Math.max(0, Math.min(1, value)) }
function minutesBetween(a: string, b: string) { return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000 }
function canonicalPair(a: string, b: string) { return a.localeCompare(b) <= 0 ? [a, b] as const : [b, a] as const }

export async function correlateObservabilityIncidents(input: {
  projectId: string
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const { data: incidents, error: incidentError } = await admin.schema('governance').from('observability_incidents')
    .select('id,dataset_id,severity,probable_root_causes,evidence,first_observed_at,last_observed_at')
    .eq('project_id', input.projectId)
    .in('status', ['OPEN', 'INVESTIGATING', 'MITIGATING'])
    .order('last_observed_at', { ascending: false })
    .limit(300)
  if (incidentError) throw new Error(`Unable to load active incidents for cross-dataset correlation: ${incidentError.message}`)
  const active = (incidents ?? []) as Incident[]
  const ids = active.map((incident) => incident.id)

  const { data: impacts, error: impactError } = ids.length
    ? await admin.schema('governance').from('observability_incident_impacts')
        .select('incident_id,asset_type,asset_id,distance,risk_score,confidence')
        .in('incident_id', ids)
        .eq('asset_type', 'DATASET')
    : { data: [], error: null }
  if (impactError) throw new Error(`Unable to load lineage evidence for cross-dataset correlation: ${impactError.message}`)
  const downstreamByIncident = new Map<string, Set<string>>()
  for (const row of impacts ?? []) {
    if (!row.asset_id) continue
    const rows = downstreamByIncident.get(row.incident_id) ?? new Set<string>()
    rows.add(row.asset_id)
    downstreamByIncident.set(row.incident_id, rows)
  }

  const qualifying = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i]
      const right = active[j]
      if (left.dataset_id === right.dataset_id) continue
      const leftEvidence = object(left.evidence)
      const rightEvidence = object(right.evidence)
      const sharedCategories = intersection(stringSet(leftEvidence.categories), stringSet(rightEvidence.categories))
      const sharedCauses = intersection(causes(left.probable_root_causes), causes(right.probable_root_causes))
      const lineageLinked = (downstreamByIncident.get(left.id)?.has(right.dataset_id) ?? false) || (downstreamByIncident.get(right.id)?.has(left.dataset_id) ?? false)
      const temporalMinutes = minutesBetween(left.last_observed_at, right.last_observed_at)
      const temporalScore = temporalMinutes <= 60 ? 0.2 : temporalMinutes <= 360 ? 0.1 : 0
      const categoryScore = Math.min(0.3, sharedCategories.length * 0.15)
      const causeScore = Math.min(0.3, sharedCauses.length * 0.2)
      const lineageScore = lineageLinked ? 0.4 : 0
      const score = clamp(temporalScore + categoryScore + causeScore + lineageScore)
      if (score < 0.45) continue

      const evidenceSignals = [temporalScore > 0, categoryScore > 0, causeScore > 0, lineageLinked].filter(Boolean).length
      const confidence = clamp(0.48 + evidenceSignals * 0.1 + (lineageLinked ? 0.08 : 0))
      const correlationType = lineageLinked && (sharedCauses.length || sharedCategories.length)
        ? 'MULTI_SIGNAL'
        : lineageLinked
          ? 'LINEAGE_RELATED'
          : sharedCauses.length || sharedCategories.length
            ? 'SHARED_FAILURE_MODE'
            : 'TEMPORAL_CLUSTER'
      const [incidentAId, incidentBId] = canonicalPair(left.id, right.id)
      qualifying.set(`${incidentAId}:${incidentBId}`, {
        project_id: input.projectId,
        incident_a_id: incidentAId,
        incident_b_id: incidentBId,
        correlation_type: correlationType,
        status: 'ACTIVE',
        score,
        confidence,
        evidence: {
          dataset_ids: [left.dataset_id, right.dataset_id],
          shared_categories: sharedCategories,
          shared_probable_root_causes: sharedCauses,
          lineage_linked: lineageLinked,
          temporal_distance_minutes: Math.round(temporalMinutes),
          score_components: { temporal: temporalScore, categories: categoryScore, causes: causeScore, lineage: lineageScore },
        },
        last_observed_at: new Date().toISOString(),
        ended_at: null,
        updated_at: new Date().toISOString(),
      })
    }
  }

  const { data: existing, error: existingError } = await admin.schema('governance').from('observability_incident_correlations')
    .select('id,incident_a_id,incident_b_id,status')
    .eq('project_id', input.projectId)
    .eq('status', 'ACTIVE')
  if (existingError) throw new Error(`Unable to load existing incident correlations: ${existingError.message}`)

  const now = new Date().toISOString()
  const endedIds = (existing ?? [])
    .filter((row) => !qualifying.has(`${row.incident_a_id}:${row.incident_b_id}`))
    .map((row) => row.id)
  if (endedIds.length) {
    const { error: endError } = await admin.schema('governance').from('observability_incident_correlations')
      .update({ status: 'ENDED', ended_at: now, updated_at: now })
      .in('id', endedIds)
    if (endError) throw new Error(`Unable to end stale incident correlations: ${endError.message}`)
  }

  if (qualifying.size) {
    const { error: upsertError } = await admin.schema('governance').from('observability_incident_correlations')
      .upsert([...qualifying.values()], { onConflict: 'project_id,incident_a_id,incident_b_id' })
    if (upsertError) throw new Error(`Unable to persist cross-dataset incident correlations: ${upsertError.message}`)
  }

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'AGENT',
    eventType: 'OBSERVABILITY_CROSS_DATASET_CORRELATION_EVALUATED',
    entityType: 'PROJECT',
    entityId: input.projectId,
    metadata: { active_incident_count: active.length, active_correlation_count: qualifying.size, ended_correlation_count: endedIds.length },
  })

  return { projectId: input.projectId, activeIncidentCount: active.length, activeCorrelationCount: qualifying.size, endedCorrelationCount: endedIds.length }
}

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { investigateObservabilityIncident } from '@/lib/observability/incident-intelligence'
import { correlateObservabilityIncidents } from '@/lib/observability/cross-dataset-correlation'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = text(url.searchParams.get('projectId'))
    const datasetId = text(url.searchParams.get('datasetId'))
    const status = text(url.searchParams.get('status')).toUpperCase()
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'observability.read')
    const admin = createAdminClient()

    let query = admin.schema('governance').from('observability_incidents')
      .select('id,project_id,dataset_id,status,severity,title,summary,probable_root_causes,business_impact,risk,recommendations,confidence,approval_required,workflow_instance_id,evidence,first_observed_at,last_observed_at,resolved_at,created_at,updated_at')
      .eq('project_id', projectId)
      .order('last_observed_at', { ascending: false })
      .limit(200)
    if (datasetId) query = query.eq('dataset_id', datasetId)
    if (status) query = query.eq('status', status)
    const { data: incidents, error: incidentsError } = await query
    if (incidentsError) throw new Error(`Unable to load observability incidents: ${incidentsError.message}`)

    const incidentIds = (incidents ?? []).map((row) => row.id)
    const incidentIdSet = new Set(incidentIds)
    const [links, impacts, correlations] = await Promise.all([
      incidentIds.length
        ? admin.schema('governance').from('observability_incident_alerts').select('incident_id,alert_id,linked_at').in('incident_id', incidentIds)
        : Promise.resolve({ data: [], error: null }),
      incidentIds.length
        ? admin.schema('governance').from('observability_incident_impacts').select('id,incident_id,asset_type,asset_id,asset_name,impact_type,distance,risk_score,confidence,evidence,created_at').in('incident_id', incidentIds).order('risk_score', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      incidentIds.length
        ? admin.schema('governance').from('observability_incident_correlations').select('id,incident_a_id,incident_b_id,correlation_type,status,score,confidence,evidence,last_observed_at').eq('project_id', projectId).eq('status', 'ACTIVE').order('score', { ascending: false }).limit(500)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (links.error) throw new Error(`Unable to load incident alert links: ${links.error.message}`)
    if (impacts.error) throw new Error(`Unable to load incident impact evidence: ${impacts.error.message}`)
    if (correlations.error) throw new Error(`Unable to load cross-dataset incident correlations: ${correlations.error.message}`)

    const alertIds = [...new Set((links.data ?? []).map((row) => row.alert_id))]
    const { data: alerts, error: alertsError } = alertIds.length
      ? await admin.schema('profiling').from('observability_alerts').select('id,category,severity,title,description,status,evidence,last_observed_at').in('id', alertIds)
      : { data: [], error: null }
    if (alertsError) throw new Error(`Unable to load incident alert evidence: ${alertsError.message}`)
    const alertById = new Map((alerts ?? []).map((alert) => [alert.id, alert]))

    const alertLinksByIncident = new Map<string, Array<Record<string, unknown>>>()
    for (const row of links.data ?? []) {
      const rows = alertLinksByIncident.get(row.incident_id) ?? []
      rows.push({ incident_id: row.incident_id, alert_id: row.alert_id, linked_at: row.linked_at, alert: alertById.get(row.alert_id) ?? null })
      alertLinksByIncident.set(row.incident_id, rows)
    }
    const impactsByIncident = new Map<string, Array<Record<string, unknown>>>()
    for (const row of impacts.data ?? []) {
      const rows = impactsByIncident.get(row.incident_id) ?? []
      rows.push(row as Record<string, unknown>)
      impactsByIncident.set(row.incident_id, rows)
    }
    const correlationsByIncident = new Map<string, Array<Record<string, unknown>>>()
    for (const row of correlations.data ?? []) {
      if (!incidentIdSet.has(row.incident_a_id) && !incidentIdSet.has(row.incident_b_id)) continue
      for (const incidentId of [row.incident_a_id, row.incident_b_id]) {
        if (!incidentIdSet.has(incidentId)) continue
        const rows = correlationsByIncident.get(incidentId) ?? []
        rows.push({ ...row, peer_incident_id: row.incident_a_id === incidentId ? row.incident_b_id : row.incident_a_id })
        correlationsByIncident.set(incidentId, rows)
      }
    }

    return NextResponse.json({
      incidents: (incidents ?? []).map((incident) => ({
        ...incident,
        alerts: alertLinksByIncident.get(incident.id) ?? [],
        impacts: impactsByIncident.get(incident.id) ?? [],
        correlations: correlationsByIncident.get(incident.id) ?? [],
      })),
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load observability incidents.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const datasetVersionId = text(body.datasetVersionId)
    const profileRunId = text(body.profileRunId) || null
    if (!datasetVersionId) return NextResponse.json({ error: 'datasetVersionId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').eq('id', datasetVersionId).maybeSingle()
    if (versionError || !version) return NextResponse.json({ error: `Dataset version not found: ${versionError?.message ?? 'not found'}` }, { status: 404 })
    const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,project_id').eq('id', version.dataset_id).maybeSingle()
    if (datasetError || !dataset) return NextResponse.json({ error: `Dataset not found: ${datasetError?.message ?? 'not found'}` }, { status: 404 })

    await authorizeProject(user.id, dataset.project_id, 'observability.manage')
    const result = await investigateObservabilityIncident({ datasetVersionId, profileRunId, userId: user.id })
    await correlateObservabilityIncidents({ projectId: dataset.project_id, actorUserId: user.id })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to investigate observability incident.' }, { status: 500 })
  }
}

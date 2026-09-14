import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { AuthorizationError, authorizationErrorResponse } from '@/lib/auth/authorize'
import { authorizeDataGovernanceSuperAdmin } from '@/lib/auth/data-governance-super-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

type CleanupKind = 'PROJECT' | 'SOURCE' | 'DATASET'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function kind(value: unknown): CleanupKind | null {
  const normalized = text(value).toUpperCase()
  return normalized === 'PROJECT' || normalized === 'SOURCE' || normalized === 'DATASET' ? normalized : null
}

async function resolveObject(targetKind: CleanupKind, id: string) {
  const admin = createAdminClient()
  if (targetKind === 'PROJECT') {
    const { data, error } = await admin.schema('app').from('projects').select('id,organization_id,name,description').eq('id', id).maybeSingle()
    if (error) throw new Error(`Unable to resolve project: ${error.message}`)
    if (!data) throw new AuthorizationError('Project was not found.', 404)
    return { id: String(data.id), projectId: String(data.id), name: String(data.name), record: data }
  }
  if (targetKind === 'SOURCE') {
    const { data, error } = await admin.schema('catalog').from('data_sources').select('id,project_id,name,status').eq('id', id).maybeSingle()
    if (error) throw new Error(`Unable to resolve source: ${error.message}`)
    if (!data) throw new AuthorizationError('Data source was not found.', 404)
    return { id: String(data.id), projectId: String(data.project_id), name: String(data.name), record: data }
  }
  const { data, error } = await admin.schema('catalog').from('datasets').select('id,project_id,name,status').eq('id', id).maybeSingle()
  if (error) throw new Error(`Unable to resolve dataset: ${error.message}`)
  if (!data) throw new AuthorizationError('Dataset was not found.', 404)
  return { id: String(data.id), projectId: String(data.project_id), name: String(data.name), record: data }
}

async function activeJobCount(projectId: string, entityIds?: string[]) {
  if (entityIds && entityIds.length === 0) return 0
  const admin = createAdminClient()
  let query = admin.schema('orchestration').from('job_queue').select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('status', ['QUEUED', 'RUNNING', 'WAITING', 'PENDING'])
  if (entityIds?.length) query = query.in('entity_id', entityIds)
  const { count, error } = await query
  if (error) throw new Error(`Unable to evaluate active orchestration dependencies: ${error.message}`)
  return count ?? 0
}

async function preflightDelete(targetKind: CleanupKind, id: string, projectId: string) {
  const admin = createAdminClient()
  const blockers: string[] = []

  if (targetKind === 'PROJECT') {
    const [jobs, datasets, sources] = await Promise.all([
      activeJobCount(projectId),
      admin.schema('catalog').from('datasets').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      admin.schema('catalog').from('data_sources').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    ])
    if (jobs > 0) blockers.push(`${jobs} active orchestration job(s)`)
    if (datasets.error) throw new Error(`Unable to evaluate project datasets: ${datasets.error.message}`)
    if (sources.error) throw new Error(`Unable to evaluate project sources: ${sources.error.message}`)
    if ((datasets.count ?? 0) > 0) blockers.push(`${datasets.count} dataset(s) must be deleted first`)
    if ((sources.count ?? 0) > 0) blockers.push(`${sources.count} data source(s) must be deleted first`)
  }

  if (targetKind === 'SOURCE') {
    const [datasets, bindings, jobs] = await Promise.all([
      admin.schema('catalog').from('datasets').select('id', { count: 'exact', head: true }).eq('data_source_id', id),
      admin.schema('governance').from('control_scope_bindings').select('id', { count: 'exact', head: true }).eq('data_source_id', id),
      activeJobCount(projectId, [id]),
    ])
    if (datasets.error) throw new Error(`Unable to evaluate source datasets: ${datasets.error.message}`)
    if (bindings.error) throw new Error(`Unable to evaluate source governance bindings: ${bindings.error.message}`)
    if ((datasets.count ?? 0) > 0) blockers.push(`${datasets.count} dataset(s) still reference this source`)
    if ((bindings.count ?? 0) > 0) blockers.push(`${bindings.count} governance control binding(s) still reference this source`)
    if (jobs > 0) blockers.push(`${jobs} active orchestration job(s)`)
  }

  if (targetKind === 'DATASET') {
    const { data: versions, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id').eq('dataset_id', id)
    if (versionError) throw new Error(`Unable to evaluate dataset versions: ${versionError.message}`)
    const versionIds = (versions ?? []).map(version => String(version.id))
    const [jobs, riskEvents] = await Promise.all([
      activeJobCount(projectId, versionIds),
      admin.schema('governance').from('governance_risk_prediction_events').select('id', { count: 'exact', head: true }).eq('dataset_id', id),
    ])
    if (riskEvents.error) throw new Error(`Unable to evaluate immutable governance evidence: ${riskEvents.error.message}`)
    if (jobs > 0) blockers.push(`${jobs} active orchestration job(s)`)
    if ((riskEvents.count ?? 0) > 0) blockers.push(`${riskEvents.count} immutable governance risk event(s) retain this dataset`)
  }

  return blockers
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const targetKind = kind(body.kind)
    const id = text(body.id)
    if (!targetKind || !id) return NextResponse.json({ error: 'kind and id are required.' }, { status: 400 })
    if (targetKind !== 'PROJECT') return NextResponse.json({ error: 'Use the existing governed dataset/source editors for this object type.' }, { status: 400 })

    const target = await resolveObject(targetKind, id)
    await authorizeDataGovernanceSuperAdmin(user.id, target.projectId)
    const name = text(body.name)
    const description = text(body.description)
    if (!name) return NextResponse.json({ error: 'Project name is required.' }, { status: 400 })
    if (name.length > 120) return NextResponse.json({ error: 'Project name must be 120 characters or fewer.' }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin.schema('app').from('projects').update({
      name,
      description: description || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('id,name,description').single()
    if (error) throw new Error(`Unable to update project: ${error.message}`)

    await writeGovernanceAudit({
      projectId: id,
      actorUserId: user.id,
      eventType: 'SUPER_ADMIN_PROJECT_UPDATED',
      entityType: 'PROJECT',
      entityId: id,
      metadata: { previous_name: target.name, name, description: description || null, authority: 'DATA_GOVERNANCE_ADMIN' },
    })
    return NextResponse.json({ project: data })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cleanup update failed.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const targetKind = kind(body.kind)
    const id = text(body.id)
    const confirmation = text(body.confirmation)
    if (!targetKind || !id) return NextResponse.json({ error: 'kind and id are required.' }, { status: 400 })

    const target = await resolveObject(targetKind, id)
    await authorizeDataGovernanceSuperAdmin(user.id, target.projectId)

    if (confirmation !== target.name) {
      return NextResponse.json({ error: 'Type the exact object name to confirm permanent deletion.' }, { status: 400 })
    }

    const blockers = await preflightDelete(targetKind, id, target.projectId)
    if (blockers.length) {
      return NextResponse.json({ error: 'Permanent deletion is blocked by governed dependencies.', blockers }, { status: 409 })
    }

    await writeGovernanceAudit({
      projectId: target.projectId,
      actorUserId: user.id,
      eventType: `SUPER_ADMIN_${targetKind}_DELETE_REQUESTED`,
      entityType: targetKind,
      entityId: id,
      metadata: { name: target.name, authority: 'DATA_GOVERNANCE_ADMIN', destructive: true },
    })

    const admin = createAdminClient()
    const deleteQuery = targetKind === 'PROJECT'
      ? admin.schema('app').from('projects').delete().eq('id', id)
      : targetKind === 'SOURCE'
        ? admin.schema('catalog').from('data_sources').delete().eq('id', id)
        : admin.schema('catalog').from('datasets').delete().eq('id', id)
    const { error } = await deleteQuery
    if (error) {
      return NextResponse.json({
        error: 'Permanent deletion was refused by a remaining governed dependency.',
        blockers: [error.message],
      }, { status: 409 })
    }

    await writeGovernanceAudit({
      projectId: targetKind === 'PROJECT' ? null : target.projectId,
      actorUserId: user.id,
      eventType: `SUPER_ADMIN_${targetKind}_DELETED`,
      entityType: targetKind,
      entityId: id,
      metadata: { name: target.name, authority: 'DATA_GOVERNANCE_ADMIN', destructive: true },
    })
    return NextResponse.json({ deleted: true, kind: targetKind, id })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cleanup deletion failed.' }, { status: 500 })
  }
}

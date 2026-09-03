import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function PATCH(request: Request, { params }: { params: Promise<{ alertId: string }> }) {
  try {
    const user = await requireUser()
    const { alertId } = await params
    const body = await request.json()
    const status = text(body.status).toUpperCase()
    if (!['OPEN','ACKNOWLEDGED','RESOLVED'].includes(status)) return NextResponse.json({ error: 'Invalid alert status.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: alert, error: alertError } = await admin.schema('profiling').from('observability_alerts').select('id,project_id').eq('id', alertId).maybeSingle()
    if (alertError || !alert) return NextResponse.json({ error: 'Alert not found.' }, { status: 404 })
    const { data: project } = await admin.schema('app').from('projects').select('id,organization_id').eq('id', alert.project_id).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER','ADMIN','MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

    const now = new Date().toISOString()
    const { data, error } = await admin.schema('profiling').from('observability_alerts').update({
      status,
      resolved_at: status === 'RESOLVED' ? now : null,
      updated_at: now,
    }).eq('id', alertId).select('id,status,resolved_at,updated_at').single()
    if (error) throw new Error(`Unable to update alert: ${error.message}`)
    return NextResponse.json({ alert: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update observability alert.' }, { status: 500 })
  }
}

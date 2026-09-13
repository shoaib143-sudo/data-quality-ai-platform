import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const projectId = String(body.projectId ?? '').trim()
    const labelId = String(body.labelId ?? '').trim()
    const name = String(body.name ?? '').trim()
    if (!projectId || !labelId || !name) {
      return NextResponse.json({ error: 'projectId, labelId and name are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'policy.approve')

    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').from('classification_policies').insert({
      project_id: projectId,
      label_id: labelId,
      name,
      description: body.description ?? null,
      required_controls: body.requiredControls ?? {},
      retention_days: Number.isFinite(Number(body.retentionDays)) ? Number(body.retentionDays) : null,
      encryption_required: Boolean(body.encryptionRequired),
      masking_required: Boolean(body.maskingRequired),
      approval_required: Boolean(body.approvalRequired),
      enabled: true,
    }).select('*').single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await writeGovernanceAudit({
      projectId,
      actorUserId: user.id,
      eventType: 'CLASSIFICATION_POLICY_CREATED',
      entityType: 'CLASSIFICATION_POLICY',
      entityId: data.id,
      metadata: {
        label_id: labelId,
        name,
        retention_days: data.retention_days,
        encryption_required: data.encryption_required,
        masking_required: data.masking_required,
        approval_required: data.approval_required,
      },
    })

    return NextResponse.json({ policy: data }, { status: 201 })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create classification policy.' }, { status: 500 })
  }
}

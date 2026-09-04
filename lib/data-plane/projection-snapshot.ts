import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export async function rebuildProjectionSnapshot(input: {
  projectId: string
  reason: string
  actorUserId?: string | null
}) {
  const reason = input.reason.trim()
  if (reason.length < 8) throw new Error('A rebuild reason of at least 8 characters is required.')

  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').rpc('rebuild_projection_snapshot', {
    p_project_id: input.projectId,
    p_reason: reason,
  })
  if (error) throw new Error(`Unable to rebuild authoritative projection snapshot: ${error.message}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'SYSTEM',
    eventType: 'PROJECTION_SNAPSHOT_REBUILT',
    entityType: 'PROJECT',
    entityId: input.projectId,
    metadata: { reason, result: data },
  })

  return data
}

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/supabase/auth'
import { resolveLandingAccess } from './landing-access'
import { canAccessWorkspace, type WorkspaceKey } from './workspace-policy'

export {
  canAccessWorkspace,
  canAccessWorkspaceHref,
  workspaceForHref,
  workspacesForPersona,
  workspacePrefixes,
} from './workspace-policy'
export type { WorkspaceKey } from './workspace-policy'

export async function requireWorkspaceAccess(workspace: WorkspaceKey) {
  const user = await requireUser()
  const context = await resolveLandingAccess(user.id)

  if (!canAccessWorkspace(context.persona, workspace, context.organizationRole)) {
    redirect(context.enabled ? '/access-denied' : '/home/unavailable')
  }

  return context
}

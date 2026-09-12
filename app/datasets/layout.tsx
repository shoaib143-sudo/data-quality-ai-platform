import type { ReactNode } from 'react'
import { canAccessWorkspace, requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function DatasetsLayout({ children }: { children: ReactNode }) {
  const context = await requireWorkspaceAccess('datasets')
  const canUseAgents = canAccessWorkspace(context.persona, 'agents', context.organizationRole)
  const canUseDiscovery = canAccessWorkspace(context.persona, 'discovery', context.organizationRole)

  return <>
    {!canUseAgents ? <style>{'a[href="/agents"]{display:none!important}'}</style> : null}
    {!canUseDiscovery ? <style>{'a[href="/catalog/discovery"]{display:none!important}'}</style> : null}
    {children}
  </>
}

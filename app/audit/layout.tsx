import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function AuditLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('audit')
  return children
}

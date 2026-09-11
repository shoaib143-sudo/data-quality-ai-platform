import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function InboxLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('inbox')
  return children
}

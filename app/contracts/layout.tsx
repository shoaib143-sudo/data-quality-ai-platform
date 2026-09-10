import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function ContractsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('contracts')
  return children
}

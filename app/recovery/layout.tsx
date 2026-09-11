import type { ReactNode } from 'react'

import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function RecoveryLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('monitoring')
  return children
}

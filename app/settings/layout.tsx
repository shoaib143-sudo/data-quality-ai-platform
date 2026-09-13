import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('account')
  return children
}


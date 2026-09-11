import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function JourneysLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('journeys')
  return children
}

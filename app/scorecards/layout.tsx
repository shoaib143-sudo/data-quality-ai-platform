import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'
import '../reporting-light.css'

export default async function ScorecardsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('scorecards')
  return children
}

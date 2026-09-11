import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function ExperienceInsightsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('experience-insights')
  return children
}

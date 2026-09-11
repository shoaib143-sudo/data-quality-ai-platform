'use client'
import { WorkspaceErrorState } from '@/components/app-shell/workspace-error'
export default function ExperienceInsightsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceErrorState error={error} reset={reset} title="Experience insights unavailable" detail="Product interaction evidence could not be summarized. Governance source-of-truth state is unaffected." fallbackHref="/journeys" fallbackLabel="Open guided journey" />
}

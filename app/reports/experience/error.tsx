'use client'

import { WorkspaceErrorState } from '@/components/app-shell/workspace-error'

export default function ExperienceInsightsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceErrorState error={error} reset={reset} title="Experience insights unavailable" detail="Product telemetry or governed outcome evidence could not be assembled completely. No governance state was changed." fallbackHref="/reports" fallbackLabel="Return to governance reports" />
}

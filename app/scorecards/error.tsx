'use client'

import { WorkspaceErrorState } from '@/components/app-shell/workspace-error'

export default function ScorecardsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceErrorState error={error} reset={reset} title="Governance scorecards unavailable" detail="Scorecard evidence could not be loaded completely. No score, control, or governance state was changed." fallbackHref="/reports" fallbackLabel="Open governance reports" />
}

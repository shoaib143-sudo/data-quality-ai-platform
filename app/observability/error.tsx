'use client'

import { WorkspaceErrorState } from '@/components/app-shell/workspace-error'

export default function ObservabilityError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceErrorState error={error} reset={reset} title="Observability workspace unavailable" detail="Operational signals could not be loaded completely. No source, quality, or alert state was changed." fallbackHref="/inbox" fallbackLabel="Open governance inbox" />
}

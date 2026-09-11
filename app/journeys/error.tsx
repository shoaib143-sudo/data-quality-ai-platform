'use client'

import { WorkspaceErrorState } from '@/components/app-shell/workspace-error'

export default function JourneysError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceErrorState error={error} reset={reset} title="Guided journey unavailable" detail="Journey evidence could not be assembled completely. No source, profiling, remediation, or quality state was changed." fallbackHref="/inbox" fallbackLabel="Open governance inbox" />
}

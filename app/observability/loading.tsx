import { WorkspaceLoadingState } from '@/components/app-shell/workspace-state'

export default function ObservabilityLoading() {
  return <WorkspaceLoadingState title="Loading observability evidence" detail="Retrieving source health, quality signals, alerts, and execution telemetry." />
}

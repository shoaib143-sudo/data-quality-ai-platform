import { WorkspaceLoadingState } from '@/components/app-shell/workspace-state'

export default function MonitoringLoading() {
  return <WorkspaceLoadingState title="Loading execution monitor" detail="Retrieving governed agent runs, progress, diagnostics, and lifecycle state." />
}

import { WorkspaceLoadingState } from '@/components/app-shell/workspace-state'

export default function ReportsLoading() {
  return <WorkspaceLoadingState title="Loading governance reports" detail="Retrieving project evidence, source readiness, issues, alerts, and reporting context." />
}

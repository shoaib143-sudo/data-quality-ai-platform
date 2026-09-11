import { WorkspaceLoadingState } from '@/components/app-shell/workspace-state'

export default function ScorecardsLoading() {
  return <WorkspaceLoadingState title="Loading governance scorecards" detail="Retrieving evidence-backed governance coverage and control-health data." />
}

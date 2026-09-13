import { displayState, type Edge, type Run, type Snapshot } from '@/lib/monitoring/execution-contract'

export type ExecutionPresentationState = 'running' | 'complete' | 'waiting' | 'failed' | 'queued' | 'cancelled' | 'skipped' | 'unknown'

export type ExecutionPresentationNode = {
  id: string
  parentId: string | null
  label: string
  state: ExecutionPresentationState
  recordedStatus: string
  isRoot: boolean
  run: Run
}

export type ExecutionPresentationEdge = {
  id: string
  source: string
  target: string
  relationship: 'ownership' | 'prerequisite'
  satisfied: boolean | null
  condition: Edge['condition'] | null
  evidence: string | null
  external: boolean
}

export type ExecutionPresentation = {
  nodes: ExecutionPresentationNode[]
  ownership: ExecutionPresentationEdge[]
  prerequisites: ExecutionPresentationEdge[]
}

export function buildExecutionPresentation(snapshot: Snapshot): ExecutionPresentation {
  const nodes: ExecutionPresentationNode[] = snapshot.runs.map(run => ({
    id: run.id,
    parentId: run.parent_run_id,
    label: run.name ?? 'Agent run',
    state: displayState(run, snapshot) as ExecutionPresentationState,
    recordedStatus: run.status,
    isRoot: run.id === snapshot.rootId,
    run,
  }))

  const ownership: ExecutionPresentationEdge[] = snapshot.runs.flatMap(run => run.parent_run_id ? [{
    id: `ownership:${run.parent_run_id}:${run.id}`,
    source: run.parent_run_id,
    target: run.id,
    relationship: 'ownership' as const,
    satisfied: null,
    condition: null,
    evidence: run.id,
    external: false,
  }] : [])

  const prerequisites: ExecutionPresentationEdge[] = snapshot.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    relationship: 'prerequisite' as const,
    satisfied: edge.satisfied,
    condition: edge.condition,
    evidence: edge.evidence,
    external: Boolean(edge.external),
  }))

  return {nodes, ownership, prerequisites}
}

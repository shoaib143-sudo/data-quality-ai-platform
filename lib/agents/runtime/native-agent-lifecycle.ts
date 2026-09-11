import {
  createNativeRuntimeCheckpoint,
  type NativeRuntimeEvidenceRef,
} from '@/lib/agents/runtime/native-agent-runtime-state'
import {
  ensureNativeRuntimeManifest,
  hashNativeRuntimeValue,
} from '@/lib/agents/runtime/native-tool-contracts'

export type NativeAgentLifecycle = {
  agentRunId: string
  manifestId: string
  checkpointId: string
}

export async function startNativeAgentLifecycle(input: {
  agentRunId: string
  phase?: string
  summary: string
  evidenceRefs?: NativeRuntimeEvidenceRef[]
}): Promise<NativeAgentLifecycle> {
  const manifestId = await ensureNativeRuntimeManifest({ agentRunId: input.agentRunId })
  const checkpointId = await createNativeRuntimeCheckpoint({
    agentRunId: input.agentRunId,
    kind: 'STEP_BOUNDARY',
    state: {
      version: '1.0',
      phase: input.phase ?? 'RUNTIME_READY',
      evidenceRefs: [
        { domain: 'native_runtime_manifest', id: manifestId },
        ...(input.evidenceRefs ?? []),
      ],
      userVisibleSummary: input.summary,
    },
  })
  return { agentRunId: input.agentRunId, manifestId, checkpointId }
}

export async function checkpointNativeAgentLifecycle(input: {
  lifecycle: NativeAgentLifecycle
  phase: string
  stepName: string
  stepOrder: number
  attempt?: number
  summary: string
  evidenceRefs?: NativeRuntimeEvidenceRef[]
}) {
  const checkpointId = await createNativeRuntimeCheckpoint({
    agentRunId: input.lifecycle.agentRunId,
    kind: 'STEP_BOUNDARY',
    parentCheckpointId: input.lifecycle.checkpointId,
    state: {
      version: '1.0',
      phase: input.phase,
      step: {
        name: input.stepName,
        order: input.stepOrder,
        attempt: input.attempt ?? 1,
      },
      evidenceRefs: input.evidenceRefs,
      userVisibleSummary: input.summary,
    },
  })
  input.lifecycle.checkpointId = checkpointId
  return checkpointId
}

export async function finishNativeAgentLifecycle(input: {
  lifecycle: NativeAgentLifecycle
  phase: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PARTIAL'
  summary: string
  output?: unknown
  evidenceRefs?: NativeRuntimeEvidenceRef[]
}) {
  const refs = [...(input.evidenceRefs ?? [])]
  if (input.output !== undefined) {
    refs.push({
      domain: 'native_runtime_output_hash',
      id: hashNativeRuntimeValue(input.output),
    })
  }
  const checkpointId = await createNativeRuntimeCheckpoint({
    agentRunId: input.lifecycle.agentRunId,
    kind: 'TERMINAL',
    parentCheckpointId: input.lifecycle.checkpointId,
    state: {
      version: '1.0',
      phase: input.phase,
      evidenceRefs: refs,
      userVisibleSummary: input.summary,
    },
  })
  input.lifecycle.checkpointId = checkpointId
  return checkpointId
}

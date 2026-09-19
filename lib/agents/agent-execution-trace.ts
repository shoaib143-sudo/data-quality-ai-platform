import {
  isGovernedAgentKey,
  type GovernedAgentKey,
} from './governed-agent-registry'

export type AgentTraceEventType =
  | 'RUN_STARTED'
  | 'SKILL_SELECTED'
  | 'TOOL_INVOKED'
  | 'EVIDENCE_ACCESSED'
  | 'HANDOFF_PROPOSED'
  | 'HANDOFF_PERSISTED'
  | 'EVALUATION_RECORDED'
  | 'RUN_COMPLETED'
  | 'RUN_FAILED'

export type AgentTraceEvent = {
  sequence: number
  eventType: AgentTraceEventType
  occurredAt: string
  skillKey?: string | null
  toolKey?: string | null
  evidenceRefs?: readonly string[]
  handoffTargetAgentKey?: GovernedAgentKey | null
  evaluationDimension?: string | null
  outcome?: string | null
}

export type AgentExecutionTrace = {
  traceVersion: '1.0'
  projectId: string
  correlationId: string
  agentRunId: string
  agentKey: GovernedAgentKey
  agentContractVersion: string
  policyVersion: string
  modelVersion: string | null
  skillRegistryVersion: string | null
  events: Array<{
    sequence: number
    eventType: AgentTraceEventType
    occurredAt: string
    skillKey: string | null
    toolKey: string | null
    evidenceRefs: string[]
    handoffTargetAgentKey: GovernedAgentKey | null
    evaluationDimension: string | null
    outcome: string | null
  }>
}

function requiredText(value: string, label: string) {
  const normalized=value.trim()
  if(!normalized) throw new Error(`${label} is required`)
  return normalized
}

function optionalText(value: string | null | undefined) {
  const normalized=value?.trim()
  return normalized ? normalized : null
}

function timestamp(value: string, label: string) {
  const parsed=Date.parse(value)
  if(!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`)
  return parsed
}

function refs(values: readonly string[] | undefined) {
  if(!values) return []
  const normalized=values.map(value=>requiredText(value,'evidenceRef'))
  if(new Set(normalized).size!==normalized.length) throw new Error('evidenceRefs must be unique per trace event')
  return [...normalized].sort()
}

export function createAgentExecutionTrace(input: {
  projectId: string
  correlationId: string
  agentRunId: string
  agentKey: GovernedAgentKey
  agentContractVersion: string
  policyVersion: string
  modelVersion?: string | null
  skillRegistryVersion?: string | null
  events: readonly AgentTraceEvent[]
}): AgentExecutionTrace {
  if(!isGovernedAgentKey(input.agentKey)) throw new Error(`Unknown governed agent: ${String(input.agentKey)}`)
  if(!input.events.length) throw new Error('At least one trace event is required')

  let previousTime=-Infinity
  const seenSequence=new Set<number>()
  const normalizedEvents=input.events.map((event,index)=>{
    if(!Number.isInteger(event.sequence) || event.sequence<1) throw new Error('Trace event sequence must be a positive integer')
    if(seenSequence.has(event.sequence)) throw new Error(`Duplicate trace event sequence: ${event.sequence}`)
    seenSequence.add(event.sequence)
    const expected=index+1
    if(event.sequence!==expected) throw new Error(`Trace event sequence must be contiguous from 1; expected ${expected} but received ${event.sequence}`)
    const occurredAtMs=timestamp(event.occurredAt,`occurredAt for sequence ${event.sequence}`)
    if(occurredAtMs<previousTime) throw new Error('Trace event timestamps must be non-decreasing')
    previousTime=occurredAtMs

    if(event.handoffTargetAgentKey!=null && !isGovernedAgentKey(event.handoffTargetAgentKey)) {
      throw new Error(`Unknown handoff target agent: ${String(event.handoffTargetAgentKey)}`)
    }

    return {
      sequence:event.sequence,
      eventType:event.eventType,
      occurredAt:event.occurredAt,
      skillKey:optionalText(event.skillKey),
      toolKey:optionalText(event.toolKey),
      evidenceRefs:refs(event.evidenceRefs),
      handoffTargetAgentKey:event.handoffTargetAgentKey ?? null,
      evaluationDimension:optionalText(event.evaluationDimension),
      outcome:optionalText(event.outcome),
    }
  })

  const terminal=normalizedEvents.filter(event=>['RUN_COMPLETED','RUN_FAILED'].includes(event.eventType))
  if(terminal.length>1) throw new Error('Agent execution trace may contain at most one terminal event')
  if(terminal.length===1 && terminal[0].sequence!==normalizedEvents.length) {
    throw new Error('Terminal trace event must be the final event')
  }
  if(normalizedEvents[0].eventType!=='RUN_STARTED') throw new Error('Agent execution trace must begin with RUN_STARTED')

  return {
    traceVersion:'1.0',
    projectId:requiredText(input.projectId,'projectId'),
    correlationId:requiredText(input.correlationId,'correlationId'),
    agentRunId:requiredText(input.agentRunId,'agentRunId'),
    agentKey:input.agentKey,
    agentContractVersion:requiredText(input.agentContractVersion,'agentContractVersion'),
    policyVersion:requiredText(input.policyVersion,'policyVersion'),
    modelVersion:optionalText(input.modelVersion),
    skillRegistryVersion:optionalText(input.skillRegistryVersion),
    events:normalizedEvents,
  }
}

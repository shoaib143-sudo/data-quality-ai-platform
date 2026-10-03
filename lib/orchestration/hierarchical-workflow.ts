import {
  validateExecutionPlan,
  type OrchestratorNode,
  type RetryClass,
} from '@/lib/orchestration/governance-orchestrator-runtime'

export const workflowTaskTypes = [
  'DETERMINISTIC',
  'AGENT',
  'DECISION',
  'APPROVAL',
  'MCP',
  'SERVICE',
  'VERIFICATION',
  'NOTIFICATION',
  'HUMAN',
  'SUBWORKFLOW',
] as const

export type WorkflowTaskType = (typeof workflowTaskTypes)[number]

export type WorkflowExecutionMode = 'GUIDED' | 'GOVERNED_AUTO' | 'FULL_AUTONOMOUS'

export type WorkflowTaskDefinition = {
  key: string
  type: WorkflowTaskType
  capabilityKey: string
  dependencies: string[]
  inputSchemaRef: string
  outputSchemaRef: string
  agentKey?: string | null
  promptVersion?: string | null
  toolKey?: string | null
  mcpServerKey?: string | null
  resourceScopes: string[]
  evidenceRequirements: string[]
  approvalPolicyKey?: string | null
  verificationPolicyKey?: string | null
  retryClass: RetryClass
  timeoutMs: number
  compensationAction?: string | null
}

export type WorkflowDefinition = {
  key: string
  version: number
  mode: WorkflowExecutionMode
  tasks: WorkflowTaskDefinition[]
  maxTaskDepth: number
  maxTaskCount: number
  maxRuntimeMs: number
}

export type CompiledWorkflowPlan = {
  workflowKey: string
  workflowVersion: number
  mode: WorkflowExecutionMode
  nodes: OrchestratorNode[]
}

function required(value: string, label: string, errors: string[]) {
  if (!value.trim()) errors.push(`${label} is required.`)
}

export function validateWorkflowDefinition(definition: WorkflowDefinition): string[] {
  const errors: string[] = []
  required(definition.key, 'Workflow key', errors)
  if (!Number.isInteger(definition.version) || definition.version < 1) errors.push('Workflow version must be an integer >= 1.')
  if (!Number.isInteger(definition.maxTaskDepth) || definition.maxTaskDepth < 1) errors.push('maxTaskDepth must be an integer >= 1.')
  if (!Number.isInteger(definition.maxTaskCount) || definition.maxTaskCount < 1) errors.push('maxTaskCount must be an integer >= 1.')
  if (!Number.isFinite(definition.maxRuntimeMs) || definition.maxRuntimeMs <= 0) errors.push('maxRuntimeMs must be finite and > 0.')
  if (definition.tasks.length > definition.maxTaskCount) errors.push('Workflow exceeds maxTaskCount.')

  const taskKeys = new Set(definition.tasks.map(task => task.key))
  if (taskKeys.size !== definition.tasks.length) errors.push('Task keys must be unique.')

  for (const task of definition.tasks) {
    required(task.key, 'Task key', errors)
    required(task.capabilityKey, `${task.key || '<blank>'}: capabilityKey`, errors)
    required(task.inputSchemaRef, `${task.key || '<blank>'}: inputSchemaRef`, errors)
    required(task.outputSchemaRef, `${task.key || '<blank>'}: outputSchemaRef`, errors)
    if (!Number.isFinite(task.timeoutMs) || task.timeoutMs <= 0) errors.push(`${task.key}: timeoutMs must be finite and > 0.`)
    if (task.type === 'AGENT' && !task.agentKey?.trim()) errors.push(`${task.key}: AGENT task requires agentKey.`)
    if (task.type === 'MCP' && !task.mcpServerKey?.trim()) errors.push(`${task.key}: MCP task requires mcpServerKey.`)
    if (task.type === 'APPROVAL' && !task.approvalPolicyKey?.trim()) errors.push(`${task.key}: APPROVAL task requires approvalPolicyKey.`)
    if (task.type === 'VERIFICATION' && !task.verificationPolicyKey?.trim()) errors.push(`${task.key}: VERIFICATION task requires verificationPolicyKey.`)
    for (const dependency of task.dependencies) {
      if (!taskKeys.has(dependency)) errors.push(`${task.key}: unknown dependency ${dependency}.`)
      if (dependency === task.key) errors.push(`${task.key}: task cannot depend on itself.`)
    }
  }

  const depthMemo = new Map<string, number>()
  const visiting = new Set<string>()
  const byKey = new Map(definition.tasks.map(task => [task.key, task]))
  const depth = (key: string): number => {
    if (depthMemo.has(key)) return depthMemo.get(key)!
    if (visiting.has(key)) return definition.maxTaskDepth + 1
    visiting.add(key)
    const task = byKey.get(key)
    const value = 1 + Math.max(0, ...(task?.dependencies.filter(dep => byKey.has(dep)).map(depth) ?? []))
    visiting.delete(key)
    depthMemo.set(key, value)
    return value
  }
  for (const key of taskKeys) {
    if (depth(key) > definition.maxTaskDepth) errors.push(`${key}: workflow dependency depth exceeds maxTaskDepth.`)
  }

  return [...new Set(errors)]
}

export function compileWorkflowDefinition(input: {
  definition: WorkflowDefinition
  policyVersion: string
  inputHashes: ReadonlyMap<string, string>
}): CompiledWorkflowPlan {
  const definitionErrors = validateWorkflowDefinition(input.definition)
  if (definitionErrors.length) throw new Error(`Invalid workflow definition: ${definitionErrors.join(' ')}`)
  required(input.policyVersion, 'Policy version', definitionErrors)
  if (definitionErrors.length) throw new Error(`Invalid workflow definition: ${definitionErrors.join(' ')}`)

  const nodes: OrchestratorNode[] = input.definition.tasks.map(task => {
    const inputHash = input.inputHashes.get(task.key)
    if (!inputHash?.trim()) throw new Error(`${task.key}: immutable input hash is required before compilation.`)
    return {
      executionKey: task.key,
      capabilityKey: task.capabilityKey,
      dependencies: [...task.dependencies],
      state: task.dependencies.length ? 'PENDING' : 'READY',
      attempt: 1,
      leaseGeneration: 0,
      policyVersion: input.policyVersion,
      inputHash,
      evidenceRequirements: [...task.evidenceRequirements],
      timeoutMs: task.timeoutMs,
      retryClass: task.retryClass,
      compensationAction: task.compensationAction ?? null,
    }
  })

  const planErrors = validateExecutionPlan(nodes)
  if (planErrors.length) throw new Error(`Invalid compiled execution plan: ${planErrors.join(' ')}`)

  return {
    workflowKey: input.definition.key,
    workflowVersion: input.definition.version,
    mode: input.definition.mode,
    nodes,
  }
}

import {
  createReasoningProvider,
  type ReasoningProvider,
  type ReasoningTask,
} from './reasoning-provider'

export type ModelSensitivity = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'
export type ModelRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type ReasoningRouteContext = {
  task: ReasoningTask
  sensitivity?: ModelSensitivity
  risk?: ModelRisk
}

export interface ModelGateway {
  reasoning(context: ReasoningRouteContext): ReasoningProvider | null
}

function taskSuffix(task: ReasoningTask) {
  return task.toUpperCase()
}

export class EnvironmentModelGateway implements ModelGateway {
  reasoning(context: ReasoningRouteContext): ReasoningProvider | null {
    const suffix = taskSuffix(context.task)
    const providerId = process.env[`AI_REASONING_PROVIDER_${suffix}`]?.trim() || null
    const model = process.env[`AI_MODEL_NAME_${suffix}`]?.trim() || null

    return createReasoningProvider({ providerId, model })
  }
}

export function getModelGateway(): ModelGateway {
  return new EnvironmentModelGateway()
}

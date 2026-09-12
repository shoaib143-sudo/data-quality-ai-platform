export type NativeRollbackStrategy = 'NOT_APPLICABLE' | 'COMPENSATION_TOOL' | 'ESCALATE_ONLY'

export type NativeRollbackContract = {
  rollbackStrategy: NativeRollbackStrategy
  compensationToolKey?: string
}

function optionalString(config: Record<string, unknown>, toolKey: string, key: string) {
  const value = config[key]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${toolKey}: execution_config.${key} must be a non-empty string`)
  }
  return value.trim()
}

export function certifyNativeRollbackContract(input: {
  config: Record<string, unknown>
  toolKey: string
  readOnly: boolean
  reversible: boolean
  compensatable: boolean
}): NativeRollbackContract {
  const { config, toolKey, readOnly, reversible, compensatable } = input
  const rawStrategy = optionalString(config, toolKey, 'rollback_strategy')
  const compensationToolKey = optionalString(config, toolKey, 'compensation_tool_key')

  if (readOnly) {
    if (rawStrategy && rawStrategy !== 'NOT_APPLICABLE') {
      throw new Error(`${toolKey}: read-only tools must use NOT_APPLICABLE rollback strategy`)
    }
    if (compensationToolKey) {
      throw new Error(`${toolKey}: read-only tools cannot declare a compensation tool`)
    }
    return { rollbackStrategy: 'NOT_APPLICABLE' }
  }

  if (rawStrategy !== 'COMPENSATION_TOOL' && rawStrategy !== 'ESCALATE_ONLY') {
    throw new Error(`${toolKey}: mutating tool requires rollback_strategy COMPENSATION_TOOL or ESCALATE_ONLY`)
  }

  if (rawStrategy === 'COMPENSATION_TOOL') {
    if (!compensationToolKey) {
      throw new Error(`${toolKey}: COMPENSATION_TOOL requires compensation_tool_key`)
    }
    if (!compensatable) {
      throw new Error(`${toolKey}: COMPENSATION_TOOL requires compensatable=true`)
    }
    return { rollbackStrategy: rawStrategy, compensationToolKey }
  }

  if (compensationToolKey || compensatable || reversible) {
    throw new Error(`${toolKey}: ESCALATE_ONLY cannot claim reversible/compensatable execution or a compensation tool`)
  }
  return { rollbackStrategy: rawStrategy }
}

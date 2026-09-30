import {
  GOVERNANCE_DESIRED_STATE_API_VERSION,
  type GovernanceDesiredState,
} from './model'

export type DesiredStateValidationResult =
  | { ok: true; value: GovernanceDesiredState }
  | { ok: false; errors: string[] }

export function validateGovernanceDesiredState(input: unknown): DesiredStateValidationResult {
  const errors: string[] = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['Desired state must be an object.'] }

  const value = input as Partial<GovernanceDesiredState>
  if (value.apiVersion !== GOVERNANCE_DESIRED_STATE_API_VERSION) errors.push(`apiVersion must be ${GOVERNANCE_DESIRED_STATE_API_VERSION}.`)
  if (!value.projectId?.trim()) errors.push('projectId is required.')
  if (!Array.isArray(value.targets) || value.targets.length === 0) errors.push('At least one target is required.')
  if (!Array.isArray(value.objects)) errors.push('objects must be an array.')

  const targetKeys = new Set<string>()
  for (const [index, target] of (value.targets ?? []).entries()) {
    if (!target?.provider?.trim()) errors.push(`targets[${index}].provider is required.`)
    if (!target?.connectionId?.trim()) errors.push(`targets[${index}].connectionId is required.`)
    const key = `${target?.provider?.trim().toLowerCase()}:${target?.connectionId?.trim()}`
    if (targetKeys.has(key)) errors.push(`targets[${index}] duplicates target ${key}.`)
    targetKeys.add(key)
  }

  const objectKeys = new Set<string>()
  for (const [index, object] of (value.objects ?? []).entries()) {
    if (!object?.id?.trim()) errors.push(`objects[${index}].id is required.`)
    if (!object?.externalKey?.trim()) errors.push(`objects[${index}].externalKey is required.`)
    if (!object?.name?.trim()) errors.push(`objects[${index}].name is required.`)
    if (object?.projectId !== value.projectId) errors.push(`objects[${index}].projectId must match desired-state projectId.`)
    const key = `${object?.type}:${object?.externalKey}`
    if (objectKeys.has(key)) errors.push(`objects[${index}] duplicates canonical key ${key}.`)
    objectKeys.add(key)
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: value as GovernanceDesiredState }
}

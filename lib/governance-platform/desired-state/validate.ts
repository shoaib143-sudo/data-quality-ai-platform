import {
  GOVERNANCE_DESIRED_STATE_API_VERSION,
  type GovernanceDesiredState,
} from './model.ts'

const CANONICAL_OBJECT_TYPES=new Set([
 'GOVERNANCE_DOMAIN','BUSINESS_TERM','TECHNICAL_ASSET','DATA_PRODUCT','CLASSIFICATION','POLICY','CONTROL',
 'OWNER','STEWARD','RELATIONSHIP','LINEAGE_EDGE','QUALITY_RULE','QUALITY_RESULT','CERTIFICATION','WORKFLOW','ISSUE','APPROVAL',
])
function isRecord(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value)}

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
    if (!CANONICAL_OBJECT_TYPES.has(String(object?.type ?? ''))) errors.push(`objects[${index}].type is unsupported.`)
    if (!object?.externalKey?.trim()) errors.push(`objects[${index}].externalKey is required.`)
    if (!object?.name?.trim()) errors.push(`objects[${index}].name is required.`)
    if (object?.projectId !== value.projectId) errors.push(`objects[${index}].projectId must match desired-state projectId.`)
    if (!isRecord(object?.attributes)) errors.push(`objects[${index}].attributes must be an object.`)
    if (!Number.isInteger(object?.version) || Number(object?.version) < 1) errors.push(`objects[${index}].version must be a positive integer.`)
    if (object?.state !== undefined && object.state !== 'present' && object.state !== 'absent') errors.push(`objects[${index}].state is invalid.`)
    if (!Array.isArray(object?.relationships)) errors.push(`objects[${index}].relationships must be an array.`)
    else for (const [relationshipIndex,relationship] of object.relationships.entries()) {
      if (!relationship || typeof relationship !== 'object' || Array.isArray(relationship)) {
        errors.push(`objects[${index}].relationships[${relationshipIndex}] must be an object.`);continue
      }
      if (!relationship.type?.trim()) errors.push(`objects[${index}].relationships[${relationshipIndex}].type is required.`)
      if (!relationship.targetId?.trim()) errors.push(`objects[${index}].relationships[${relationshipIndex}].targetId is required.`)
      if (relationship.attributes !== undefined && !isRecord(relationship.attributes)) errors.push(`objects[${index}].relationships[${relationshipIndex}].attributes must be an object.`)
    }
    const key = `${object?.type}:${object?.externalKey}`
    if (objectKeys.has(key)) errors.push(`objects[${index}] duplicates canonical key ${key}.`)
    objectKeys.add(key)
  }

  const objects=(value.objects??[]).filter(isRecord)
  const explicitlyAbsentIds=new Set(objects.filter(object=>object.state==='absent'&&typeof object.id==='string').map(object=>String(object.id)))
  for(const [index,object] of objects.entries()){
    if(object.state==='absent'||!Array.isArray(object.relationships))continue
    for(const relationship of object.relationships){
      if(isRecord(relationship)&&typeof relationship.targetId==='string'&&explicitlyAbsentIds.has(relationship.targetId)){
        errors.push(`objects[${index}] cannot reference explicitly absent object ${relationship.targetId}.`)
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: value as GovernanceDesiredState }
}

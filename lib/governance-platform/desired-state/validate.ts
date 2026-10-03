import {
  GOVERNANCE_DESIRED_STATE_API_VERSION,
  type GovernanceDesiredState,
} from './model.ts'

const CANONICAL_OBJECT_TYPES=new Set([
 'GOVERNANCE_DOMAIN','BUSINESS_TERM','TECHNICAL_ASSET','DATA_PRODUCT','CLASSIFICATION','POLICY','CONTROL',
 'OWNER','STEWARD','RELATIONSHIP','LINEAGE_EDGE','QUALITY_RULE','QUALITY_RESULT','CERTIFICATION','WORKFLOW','ISSUE','APPROVAL',
])
function isRecord(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value)}
function nonEmptyString(value:unknown):value is string{return typeof value==='string'&&value.trim().length>0}

export type DesiredStateValidationResult =
  | { ok: true; value: GovernanceDesiredState }
  | { ok: false; errors: string[] }

export function validateGovernanceDesiredState(input: unknown): DesiredStateValidationResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ['Desired state must be an object.'] }

  if (input.apiVersion !== GOVERNANCE_DESIRED_STATE_API_VERSION) errors.push(`apiVersion must be ${GOVERNANCE_DESIRED_STATE_API_VERSION}.`)
  if (!nonEmptyString(input.projectId)) errors.push('projectId is required.')
  if (!Array.isArray(input.targets) || input.targets.length === 0) errors.push('At least one target is required.')
  if (!Array.isArray(input.objects)) errors.push('objects must be an array.')

  const targets=Array.isArray(input.targets)?input.targets:[]
  const objects=Array.isArray(input.objects)?input.objects:[]
  const targetKeys = new Set<string>()
  for (const [index, targetValue] of targets.entries()) {
    if(!isRecord(targetValue)){errors.push(`targets[${index}] must be an object.`);continue}
    const provider=targetValue.provider
    const connectionId=targetValue.connectionId
    if (!nonEmptyString(provider)) errors.push(`targets[${index}].provider is required.`)
    if (!nonEmptyString(connectionId)) errors.push(`targets[${index}].connectionId is required.`)
    if(nonEmptyString(provider)&&nonEmptyString(connectionId)){
      const key = `${provider.trim().toLowerCase()}:${connectionId.trim()}`
      if (targetKeys.has(key)) errors.push(`targets[${index}] duplicates target ${key}.`)
      targetKeys.add(key)
    }
  }

  const objectKeys = new Set<string>()
  for (const [index, objectValue] of objects.entries()) {
    if(!isRecord(objectValue)){errors.push(`objects[${index}] must be an object.`);continue}
    const id=objectValue.id
    const type=objectValue.type
    const externalKey=objectValue.externalKey
    const name=objectValue.name
    if (!nonEmptyString(id)) errors.push(`objects[${index}].id is required.`)
    if (typeof type!=='string'||!CANONICAL_OBJECT_TYPES.has(type)) errors.push(`objects[${index}].type is unsupported.`)
    if (!nonEmptyString(externalKey)) errors.push(`objects[${index}].externalKey is required.`)
    if (!nonEmptyString(name)) errors.push(`objects[${index}].name is required.`)
    if (objectValue.projectId !== input.projectId) errors.push(`objects[${index}].projectId must match desired-state projectId.`)
    if (!isRecord(objectValue.attributes)) errors.push(`objects[${index}].attributes must be an object.`)
    if (!Number.isInteger(objectValue.version) || Number(objectValue.version) < 1) errors.push(`objects[${index}].version must be a positive integer.`)
    if (objectValue.state !== undefined && objectValue.state !== 'present' && objectValue.state !== 'absent') errors.push(`objects[${index}].state is invalid.`)
    if (!Array.isArray(objectValue.relationships)) errors.push(`objects[${index}].relationships must be an array.`)
    else for (const [relationshipIndex,relationshipValue] of objectValue.relationships.entries()) {
      if (!isRecord(relationshipValue)) {
        errors.push(`objects[${index}].relationships[${relationshipIndex}] must be an object.`);continue
      }
      if (!nonEmptyString(relationshipValue.type)) errors.push(`objects[${index}].relationships[${relationshipIndex}].type is required.`)
      if (!nonEmptyString(relationshipValue.targetId)) errors.push(`objects[${index}].relationships[${relationshipIndex}].targetId is required.`)
      if (relationshipValue.attributes !== undefined && !isRecord(relationshipValue.attributes)) errors.push(`objects[${index}].relationships[${relationshipIndex}].attributes must be an object.`)
    }
    if(typeof type==='string'&&nonEmptyString(externalKey)){
      const key = `${type}:${externalKey}`
      if (objectKeys.has(key)) errors.push(`objects[${index}] duplicates canonical key ${key}.`)
      objectKeys.add(key)
    }
  }

  const objectRecords=objects.filter(isRecord)
  const explicitlyAbsentIds=new Set(objectRecords.filter(object=>object.state==='absent'&&typeof object.id==='string').map(object=>String(object.id)))
  for(const [index,object] of objectRecords.entries()){
    if(object.state==='absent'||!Array.isArray(object.relationships))continue
    for(const relationship of object.relationships){
      if(isRecord(relationship)&&typeof relationship.targetId==='string'&&explicitlyAbsentIds.has(relationship.targetId)){
        errors.push(`objects[${index}] cannot reference explicitly absent object ${relationship.targetId}.`)
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: input as unknown as GovernanceDesiredState }
}

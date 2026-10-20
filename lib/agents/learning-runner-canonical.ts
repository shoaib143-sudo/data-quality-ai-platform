import { createHash } from 'node:crypto'

export function canonicalLearningValue(value:unknown):unknown{
  if(value===null||typeof value==='string'||typeof value==='boolean') return value
  if(typeof value==='number'){
    if(!Number.isFinite(value)) throw new Error('LEARNING_CANONICAL_NONFINITE_VALUE')
    return value
  }
  if(Array.isArray(value)) return value.map(canonicalLearningValue)
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.entries(value as Record<string,unknown>)
      .filter(([,item])=>item!==undefined)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,item])=>[key,canonicalLearningValue(item)]))
  }
  throw new Error('LEARNING_CANONICAL_UNSUPPORTED_VALUE')
}

export function canonicalLearningJson(value:unknown){
  return JSON.stringify(canonicalLearningValue(value))
}

export function canonicalLearningJsonBytes(value:unknown){
  return Buffer.from(canonicalLearningJson(value),'utf8')
}

export function learningSha256(value:Uint8Array|string){
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

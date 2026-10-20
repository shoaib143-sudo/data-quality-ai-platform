import assert from 'node:assert/strict'
import './lib/register-typescript-resolution.mjs'

const {canonicalLearningJson,canonicalLearningJsonBytes,learningSha256}=await import('../lib/agents/learning-runner-canonical.ts')

const left={z:3,a:{d:4,b:2},items:[{y:2,x:1}],ignored:undefined}
const right={items:[{x:1,y:2}],a:{b:2,d:4},z:3}
assert.equal(canonicalLearningJson(left),canonicalLearningJson(right))
assert.equal(
  learningSha256(canonicalLearningJsonBytes(left)),
  learningSha256(canonicalLearningJsonBytes(right)),
)
assert.throws(()=>canonicalLearningJson({bad:Number.NaN}),/LEARNING_CANONICAL_NONFINITE_VALUE/)
assert.throws(()=>canonicalLearningJson({bad:BigInt(1)}),/LEARNING_CANONICAL_UNSUPPORTED_VALUE/)
console.log('Canonical learning artifact serialization is deterministic and rejects unsupported values')

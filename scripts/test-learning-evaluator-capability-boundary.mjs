import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const authorize=fs.readFileSync('lib/auth/authorize.ts','utf8')
const activation=fs.readFileSync('lib/agents/learning-runner-activation.ts','utf8')
assert.match(authorize,/'agent\.learning\.evaluate'/)
assert.match(authorize,/'agent\.learning\.assign_evaluator'/)
assert.match(activation,/authorizeProject\(input\.evaluatorUserId,input\.projectId,'agent\.learning\.evaluate'\)/)
assert.match(activation,/authorizeProject\(activation\.evaluatorUserId,plan\.policy\.projectId,'agent\.learning\.evaluate'\)/)
assert.match(activation,/authorizeProject\(input\.assignedBy,input\.projectId,'agent\.learning\.assign_evaluator'\)/)

const migrations=fs.readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql'))
const grants=[]
for(const name of migrations){
  const text=fs.readFileSync(path.join('supabase/migrations',name),'utf8')
  if(text.includes('agent.learning.evaluate')||text.includes('agent.learning.assign_evaluator')) grants.push(name)
}
assert.deepEqual(grants,[],'activation PR must not grant agent.learning.evaluate to any role or migration')

console.log('Learning evaluator and evaluator-assignment capabilities are narrow, required at runtime, and intentionally unassigned')

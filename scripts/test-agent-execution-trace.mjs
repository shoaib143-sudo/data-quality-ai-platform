import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'

const { createAgentExecutionTrace } = await import('../lib/agents/agent-execution-trace.ts')

const trace=createAgentExecutionTrace({
  projectId:'project-1',
  correlationId:'corr-1',
  agentRunId:'run-1',
  agentKey:'investigator_agent',
  agentContractVersion:'ADR-007-v1',
  policyVersion:'policy-v1',
  modelVersion:null,
  skillRegistryVersion:'skills-v1',
  events:[
    {sequence:1,eventType:'RUN_STARTED',occurredAt:'2026-09-18T00:00:00Z'},
    {sequence:2,eventType:'SKILL_SELECTED',occurredAt:'2026-09-18T00:00:01Z',skillKey:'incident_root_cause_analysis'},
    {sequence:3,eventType:'EVIDENCE_ACCESSED',occurredAt:'2026-09-18T00:00:02Z',evidenceRefs:['incident-1','profile-1']},
    {sequence:4,eventType:'EVALUATION_RECORDED',occurredAt:'2026-09-18T00:00:03Z',evaluationDimension:'grounding',outcome:'PASS'},
    {sequence:5,eventType:'RUN_COMPLETED',occurredAt:'2026-09-18T00:00:04Z',outcome:'SUCCEEDED'},
  ],
})

assert.equal(trace.traceVersion,'1.0')
assert.equal(trace.agentKey,'investigator_agent')
assert.equal(trace.events.length,5)
assert.deepEqual(trace.events[2].evidenceRefs,['incident-1','profile-1'])
assert.equal(trace.events[4].eventType,'RUN_COMPLETED')

assert.throws(()=>createAgentExecutionTrace({
  projectId:'project-1',
  correlationId:'corr-2',
  agentRunId:'run-2',
  agentKey:'support_agent',
  agentContractVersion:'v1',
  policyVersion:'p1',
  events:[
    {sequence:2,eventType:'RUN_STARTED',occurredAt:'2026-09-18T00:00:00Z'},
  ],
}),/sequence must be contiguous/)

assert.throws(()=>createAgentExecutionTrace({
  projectId:'project-1',
  correlationId:'corr-3',
  agentRunId:'run-3',
  agentKey:'support_agent',
  agentContractVersion:'v1',
  policyVersion:'p1',
  events:[
    {sequence:1,eventType:'RUN_STARTED',occurredAt:'2026-09-18T00:00:02Z'},
    {sequence:2,eventType:'RUN_COMPLETED',occurredAt:'2026-09-18T00:00:01Z'},
  ],
}),/timestamps must be non-decreasing/)

assert.throws(()=>createAgentExecutionTrace({
  projectId:'project-1',
  correlationId:'corr-4',
  agentRunId:'run-4',
  agentKey:'support_agent',
  agentContractVersion:'v1',
  policyVersion:'p1',
  events:[
    {sequence:1,eventType:'RUN_STARTED',occurredAt:'2026-09-18T00:00:00Z'},
    {sequence:2,eventType:'RUN_COMPLETED',occurredAt:'2026-09-18T00:00:01Z'},
    {sequence:3,eventType:'EVALUATION_RECORDED',occurredAt:'2026-09-18T00:00:02Z'},
  ],
}),/Terminal trace event must be the final event/)

assert.throws(()=>createAgentExecutionTrace({
  projectId:'project-1',
  correlationId:'corr-5',
  agentRunId:'run-5',
  agentKey:'architect_agent',
  agentContractVersion:'v1',
  policyVersion:'p1',
  events:[
    {sequence:1,eventType:'EVIDENCE_ACCESSED',occurredAt:'2026-09-18T00:00:00Z',evidenceRefs:['e1']},
  ],
}),/must begin with RUN_STARTED/)

assert.throws(()=>createAgentExecutionTrace({
  projectId:'project-1',
  correlationId:'corr-6',
  agentRunId:'run-6',
  agentKey:'architect_agent',
  agentContractVersion:'v1',
  policyVersion:'p1',
  events:[
    {sequence:1,eventType:'RUN_STARTED',occurredAt:'2026-09-18T00:00:00Z'},
    {sequence:2,eventType:'EVIDENCE_ACCESSED',occurredAt:'2026-09-18T00:00:01Z',evidenceRefs:['dup','dup']},
  ],
}),/evidenceRefs must be unique/)

console.log('Agent execution trace contract enforces canonical agents, ordered timestamps, contiguous sequence numbers, evidence provenance, and terminal-event integrity.')

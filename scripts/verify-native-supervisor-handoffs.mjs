import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const service = readFileSync('lib/agents/runtime/native-supervisor-service.ts','utf8')
const specialist = readFileSync('lib/agents/governance-specialist-agent.ts','utf8')
const route = readFileSync('app/api/agents/supervisor/run/route.ts','utf8')
const migration = readFileSync('supabase/migrations/20260912040500_governance_specialist_handoff_contracts.sql','utf8')

function has(source, token, label) { assert.ok(source.includes(token), `${label} missing: ${token}`) }

has(route, 'workerId:', 'worker identity input')
has(route, 'dependsOn:', 'dependency input')
has(service, 'getGovernedAgentPolicy(source.agentKey).handoffTargets.includes(worker.agentKey)', 'registry handoff validation')
has(service, 'Duplicate workerId:', 'unique worker ids')
has(service, 'depends on unknown worker', 'unknown dependency rejection')
has(service, 'cannot depend on itself', 'self dependency rejection')
has(service, 'const stepIdByWorkerId', 'stable worker to step mapping')
has(service, 'const stepAgentRunIds', 'precreated child run binding')
has(service, 'handoffRefs:', 'plan-bound handoff references')
has(service, 'dependsOn: dependencyStepIds', 'native DAG dependencies')
const childLoop = service.indexOf("status: 'QUEUED'")
const planPush = service.indexOf('steps.push({')
assert.ok(childLoop >= 0 && planPush > childLoop, 'child runs must be created before DAG steps are built')

has(specialist, 'handoffRefs?: Array<{', 'specialist handoff input')
has(specialist, "toolInput: {", 'native admission input')
has(specialist, '...(handoffRefs.length ? { handoffRefs } : {})', 'handoff refs included in pinned tool input')
const admission = specialist.indexOf('admitNativeToolInvocation({')
const sourceRead = specialist.indexOf(".select('id,parent_run_id,project_id,status,output')")
assert.ok(admission >= 0 && sourceRead > admission, 'handoff source evidence must resolve only after native admission')
has(specialist, "sourceRun.status !== 'SUCCEEDED'", 'succeeded predecessor requirement')
has(specialist, 'outside the current supervisor run', 'sibling-run boundary')
has(specialist, 'getGovernedAgentPolicy(ref.sourceAgentKey).handoffTargets.includes(agentKey)', 'downstream handoff revalidation')
has(specialist, 'slice(0, 320)', 'bounded finding text')
has(specialist, 'slice(0, 6)', 'bounded findings per source')
has(specialist, 'hashNativeRuntimeValue(sourceRun.output)', 'handoff output hash')

has(migration, "set version = '1.2'", 'specialist handoff contract version')
has(migration, "'maxItems', 5", 'bounded handoff sources schema')
has(migration, "'handoff_context_mode', 'validated_sibling_run_refs'", 'handoff contract mode')
has(migration, "'handoff_max_findings_per_source', 6", 'finding count contract')
has(migration, "'handoff_max_finding_chars', 320", 'finding size contract')
has(migration, 'if v_count <> 6 then', 'six-contract postcondition')

console.log('Native supervisor specialist handoffs verified.')

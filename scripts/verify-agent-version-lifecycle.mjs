import fs from 'node:fs'
import path from 'node:path'

function read(file) { return fs.readFileSync(path.join(process.cwd(), file), 'utf8') }
function requireText(source, text, message) { if (!source.includes(text)) throw new Error(message) }

const migration = read('supabase/migrations/20260919123000_agent_version_lifecycle.sql')
const service = read('lib/agents/runtime/agent-version-lifecycle.ts')

for (const state of ['DRAFT','VALIDATED','CANDIDATE','ACTIVE','DEPRECATED','RETIRED']) {
  requireText(migration, `'${state}'`, `Lifecycle must include ${state}.`)
}
requireText(migration, "where lifecycle_state = 'ACTIVE'", 'Exactly one ACTIVE version per agent key must be enforced.')
requireText(migration, 'agent_version_transition_allowed', 'Transitions must be explicit and deterministic.')
requireText(migration, "when p_from = 'DEPRECATED' and p_to in ('ACTIVE','RETIRED')", 'Rollback from DEPRECATED to ACTIVE must remain supported.')
requireText(migration, 'agent_runs_active_version_execution_guard', 'Execution must fail closed for non-ACTIVE versions.')
requireText(migration, "new.status::text in ('QUEUED','RUNNING','WAITING')", 'Admission states must require ACTIVE version.')
requireText(migration, 'Agent version lifecycle events are immutable audit evidence', 'Lifecycle transition evidence must be immutable.')
requireText(migration, 'Automatically deprecated by promotion', 'Promotion must atomically demote a previous ACTIVE version.')
requireText(service, "rpc('assert_active_agent_version'", 'Runtime service must expose the database ACTIVE assertion.')
requireText(service, "rpc('transition_agent_version_lifecycle'", 'Lifecycle changes must use the governed transition RPC.')

console.log('Runtime v2 agent version lifecycle contract verified.')

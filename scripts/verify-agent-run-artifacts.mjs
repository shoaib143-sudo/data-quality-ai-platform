import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260911170000_durable_agent_run_result_artifacts.sql', 'utf8')
const profilingMigration = fs.readFileSync('supabase/migrations/20260911173000_profiling_agent_run_result_artifacts.sql', 'utf8')
const helper = fs.readFileSync('lib/agents/run-result-artifact.ts', 'utf8')
const route = fs.readFileSync('app/api/agents/governance/run/route.ts', 'utf8')
const profilingJob = fs.readFileSync('lib/agents/run-profiling-job.ts', 'utf8')
const detail = fs.readFileSync('app/agents/runs/[runId]/page.tsx', 'utf8')

function requireText(source, token, label) {
  if (!source.includes(token)) throw new Error(`Missing ${label}: ${token}`)
}

function rejectText(source, token, label) {
  if (source.includes(token)) throw new Error(`Forbidden ${label}: ${token}`)
}

function requireCount(source, token, minimum, label) {
  const count = source.split(token).length - 1
  if (count < minimum) throw new Error(`Missing ${label}: expected at least ${minimum} occurrences of ${token}, found ${count}`)
}

requireText(migration, 'agent_artifacts_run_type_version_key', 'canonical artifact uniqueness')
requireText(migration, 'security definer', 'security-definer persistence boundary')
requireText(migration, "v_run.status not in ('RUNNING', 'SUCCEEDED')", 'successful-run lifecycle guard')
requireText(migration, "extensions.digest(p_output::text, 'sha256')", 'content-addressed artifact hash')
requireText(migration, 'artifact integrity conflict', 'retry integrity conflict rejection')
requireText(migration, 'grant execute on function agent.persist_agent_run_result', 'service-role persistence grant')
requireText(migration, 'revoke insert, update, delete, truncate on agent.agent_artifacts from service_role', 'direct artifact write revocation')
requireText(migration, 'revoke select on agent.agent_artifacts from anon', 'anonymous artifact read revocation')

requireText(helper, "AGENT_RUN_RESULT_ARTIFACT_TYPE = 'AGENT_RUN_RESULT'", 'canonical result artifact type')
requireText(helper, ".schema('agent').rpc('persist_agent_run_result'", 'governed artifact RPC usage')
requireText(helper, 'returned incomplete evidence', 'artifact evidence completeness guard')

requireText(route, 'persistAgentRunResultArtifact', 'governance run artifact persistence')
requireText(route, "operation: 'governed_agent_result_artifact'", 'artifact telemetry stage')
requireText(route, 'artifact_id: artifact.artifactId', 'artifact provenance telemetry')
requireText(route, 'output, artifact, memory', 'artifact API evidence')

requireText(profilingMigration, 'trg_enforce_profiling_success_output', 'profiling success/output integrity trigger')
requireText(profilingMigration, "d.agent_key = 'profiling_agent'", 'profiling-agent scope')
requireText(profilingMigration, "r.status = 'SUCCEEDED'", 'successful profiling backfill scope')
requireText(profilingMigration, 'r.output is not null', 'genuine persisted output backfill requirement')
requireText(profilingMigration, 'cannot be marked SUCCEEDED without canonical output', 'profiling false-success guard')
requireText(profilingMigration, 'agent.persist_agent_run_result(', 'canonical backfill persistence boundary')

requireText(profilingJob, "import { persistAgentRunResultArtifact } from '@/lib/agents/run-result-artifact'", 'profiling artifact helper import')
requireCount(profilingJob, 'await persistAgentRunResultArtifact({', 2, 'fresh and reused profiling artifact persistence')
requireText(profilingJob, "name: 'Profiling agent result'", 'profiling result artifact name')
rejectText(profilingJob, ".from('agent_runs').update({ status: 'SUCCEEDED', output: result", 'direct profiling success/output persistence bypass')

requireText(detail, ".from('agent_artifacts')", 'run-detail artifact read')
requireText(detail, 'artifact.content_hash', 'run-detail content hash display')
requireText(detail, 'artifact.payload', 'run-detail artifact payload display')

if (/question\s*:|prompt\s*:|reasoning\s*:/.test(helper)) {
  throw new Error('Artifact persistence helper must not persist prompt or hidden reasoning fields.')
}

console.log('Durable agent run artifact contract verified, including profiling executions.')

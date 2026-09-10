import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const queue = read('lib/orchestration/queue.ts')
const worker = read('app/api/jobs/worker/route.ts')
const migration = read('supabase/migrations/20260910143000_p5_worker_pool_isolation_and_capacity.sql')

const contracts = {
  workerSecretRequired: /CRON_SECRET|verify_worker_secret/.test(worker) && /Worker access denied/.test(worker),
  poolTypeDeclared: /DurableWorkloadPool = 'CORE' \| 'SEMANTIC' \| 'GOVERNANCE'/.test(queue),
  dedicatedPoolOverride: /ORCHESTRATION_WORKLOAD_POOL/.test(queue),
  runtimeUsesPoolRpc: /rpc\('claim_jobs_by_pool'/.test(queue),
  runtimeDoesNotUseLegacyClaimRpc: !/rpc\('claim_jobs'/.test(queue),
  migrationDefinesPoolRpc: /function orchestration\.claim_jobs_by_pool\(/i.test(migration),
  invalidPoolFailsClosed: /Unsupported workload pool/.test(migration),
  semanticIsolation: /v_pool = 'SEMANTIC' and q\.job_type = 'SEMANTIC_INDEX'/.test(migration),
  governanceIsolation: /v_pool = 'GOVERNANCE' and q\.job_type = 'GOVERNANCE_AGENT'/.test(migration),
  coreIsolation: /v_pool = 'CORE' and q\.job_type not in \('SEMANTIC_INDEX', 'GOVERNANCE_AGENT'\)/.test(migration),
  dependencyGatePreserved: /job_dependencies/.test(migration) && /dependency_type = 'SUCCESS'/.test(migration),
  projectCapacityEnforced: /max_concurrent_jobs/.test(migration) && /v_running >= v_max/.test(migration),
  serviceRoleOnly: /revoke execute on function orchestration\.claim_jobs_by_pool\(text,text,integer\) from public,anon,authenticated/i.test(migration) && /grant execute on function orchestration\.claim_jobs_by_pool\(text,text,integer\) to service_role/i.test(migration),
  boundedClaimBatch: /least\(coalesce\(p_limit, 2\), 16\)/.test(migration),
}

const failed = Object.entries(contracts).filter(([, valid]) => !valid).map(([name]) => name)
console.log(JSON.stringify({ valid: failed.length === 0, contracts }, null, 2))
if (failed.length) {
  console.error(`Worker runtime contract failures: ${failed.join(', ')}`)
  process.exit(1)
}

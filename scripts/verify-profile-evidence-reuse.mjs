import fs from 'node:fs'

const reuse = fs.readFileSync('lib/profiling/evidence-reuse.ts', 'utf8')
const fileProfile = fs.readFileSync('lib/profiling/file-profile.ts', 'utf8')
const fileSource = fs.readFileSync('lib/profiling/file-source-adapter.ts', 'utf8')
const runner = fs.readFileSync('lib/agents/run-profiling-job.ts', 'utf8')
const promotion = fs.readFileSync('supabase/migrations/20260907041300_fix_asset_repromotion_versioning.sql', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260907115000_truth_aware_profile_evidence_reuse.sql', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Profile evidence reuse contract missing: ${label}`)
}

requireText(promotion, 'v_asset.structure_hash,\n      v_asset.structure_hash,', 'native promoted content hash is currently structure hash, not source content')
requireText(fileSource, "createHash('sha256').update(bytes).digest('hex')", 'FILE source content hash is derived from actual bytes')
requireText(fileProfile, "content_hash_authority: 'SOURCE_BYTES_SHA256'", 'FILE byte-hash authority evidence')
requireText(fs.readFileSync('lib/profiling/metric-engine.ts', 'utf8'), "content_hash_authority: 'SOURCE_BYTES_SHA256'", 'metric execution preserves FILE byte-hash authority')
requireText(fileProfile, 'content_hash: loaded.contentHash', 'FILE source byte hash persisted on profile run')

requireText(reuse, "if (!['FILE', 'CSV'].includes(sourceType))", 'reuse limited to file-backed sources')
requireText(reuse, "reason: 'SOURCE_FRESHNESS_FINGERPRINT_UNAVAILABLE'", 'unsupported source explicit ineligibility')
requireText(reuse, "sourceType === 'JDBC' ? 'STRUCTURE_HASH_NOT_SOURCE_CONTENT'", 'JDBC structure hash rejection')
requireText(reuse, "sourceProfileRunId: null", 'ineligible reuse has no fabricated source run')
requireText(reuse, "metric_contract: metricContract", 'enabled metric contract included in configuration fingerprint')
requireText(reuse, 'dataset_version_id: datasetVersionId', 'dataset version included in profile signature')
requireText(reuse, ".eq('dataset_version_id', datasetVersionId)", 'reuse candidate restricted to same dataset version')
requireText(reuse, ".eq('content_hash', contentHash)", 'exact source content hash match')
requireText(reuse, ".eq('schema_hash', schemaHash)", 'exact schema hash match')
requireText(reuse, ".eq('configuration_hash', configurationHash)", 'exact configuration hash match')
requireText(reuse, ".eq('profile_signature', profileSignature)", 'exact profile signature match')
requireText(reuse, "record(candidate.summary).execution_mode !== 'REUSED'", 'reuse chains excluded')
requireText(reuse, 'validateProfilingRun(sourceRun.id, userId)', 'source evidence current-contract validation')
requireText(reuse, "rpc('reuse_profile_evidence'", 'atomic evidence materialization RPC')

requireText(migration, 'if v_source.dataset_version_id <> v_target.dataset_version_id', 'SQL same-version enforcement')
requireText(migration, 'Profiling evidence reuse project boundary mismatch', 'SQL same-project enforcement')
requireText(migration, "coalesce(v_source.summary->>'execution_mode', 'EXECUTED') = 'REUSED'", 'SQL reuse-chain rejection')
requireText(migration, 'v_source.content_hash is distinct from v_target.content_hash', 'SQL content fingerprint equality')
requireText(migration, 'v_source.schema_hash is distinct from v_target.schema_hash', 'SQL schema fingerprint equality')
requireText(migration, 'v_source.configuration_hash is distinct from v_target.configuration_hash', 'SQL configuration fingerprint equality')
requireText(migration, 'v_source.profile_signature is distinct from p_profile_signature', 'SQL profile signature equality')
requireText(migration, "'execution_mode', 'REUSED'", 'reused execution mode evidence')
requireText(migration, "'reuse_fingerprint_authority', 'SOURCE_BYTES_SHA256'", 'reused byte-hash authority evidence')
requireText(migration, "grant execute on function profiling.reuse_profile_evidence(uuid, uuid, uuid, text) to service_role", 'service role execution only')
requireText(migration, 'revoke all on function profiling.reuse_profile_evidence', 'public execution revoked')

requireText(runner, 'tryReuseProfileEvidence({', 'profiling runner reuse planner integration')
requireText(runner, 'evidence reuse planner failed safely', 'reuse planner failure falls back to execution')
requireText(runner, "execution_mode: 'REUSED'", 'agent run explicitly records reuse')
requireText(runner, "stepOrder: 2", 'metric step retained as evidence step')
requireText(runner, "stepOrder: 3", 'investigation step retained as evidence step')
requireText(runner, 'validateProfilingRun(profilingRunId, userId)', 'reused run validated before agent success')

if (reuse.includes("['FILE', 'CSV', 'JDBC']") || reuse.includes("sourceType === 'JDBC' &&")) {
  throw new Error('JDBC/Databricks must not become evidence-reuse eligible without a source freshness fingerprint.')
}
if (reuse.includes('dataset_versions.content_hash') || reuse.includes('version.content_hash')) {
  throw new Error('Reuse planner must not treat catalog dataset-version structure hash as source-content freshness evidence.')
}
if (migration.includes('p_source_profile_run_id = p_profile_run_id')) {
  throw new Error('Reuse materialization must reject self reuse, not normalize it.')
}

console.log('Truth-aware profiling evidence reuse contracts verified.')

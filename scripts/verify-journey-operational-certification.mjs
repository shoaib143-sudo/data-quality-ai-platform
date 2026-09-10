import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const exists = (path) => fs.existsSync(path)

const v6 = read('.github/workflows/v6-operational-certification.yml')
const codeql = read('.github/workflows/codeql-security.yml')
const dependency = read('.github/workflows/dependency-review.yml')
const packageJson = JSON.parse(read('package.json'))
const syntheticAuthorityMigration = read('supabase/migrations/20260910190500_align_synthetic_governance_suite_with_contract_authority.sql')
const governanceIntelligenceReplayPath = 'scripts/prepare-clean-governance-intelligence-replay.mjs'
const governanceIntelligenceReplay = read(governanceIntelligenceReplayPath)
const controlEvidenceReplayPath = 'scripts/prepare-clean-control-evidence-syntax-replay.mjs'
const controlEvidenceReplay = read(controlEvidenceReplayPath)
const agentStatusReplayPath = 'scripts/prepare-clean-agent-status-replay.mjs'
const agentStatusReplay = read(agentStatusReplayPath)
const operationalMarker = "writeRecoveredMigration(\n  '20260904210139'"
const operationalStart = governanceIntelligenceReplay.indexOf(operationalMarker)
const coreReplay = operationalStart >= 0 ? governanceIntelligenceReplay.slice(0, operationalStart) : governanceIntelligenceReplay
const operationalReplay = operationalStart >= 0 ? governanceIntelligenceReplay.slice(operationalStart) : ''
const requiredJourneys = [
  'scripts/verify-v0-trusted-governance-baseline.mjs',
  'scripts/verify-journey-sensitive-governance.mjs',
  'scripts/verify-journey-dq-incident.mjs',
  'scripts/verify-journey-change-governance.mjs',
  'scripts/verify-journey-governed-investigation.mjs',
  'scripts/verify-journey-governed-outcome-learning.mjs',
]

const checks = [
  ['V0 through V5 journey authorities exist', requiredJourneys.every(exists)],
  ['V6 reruns cumulative journeys', requiredJourneys.every((path) => v6.includes(path))],
  ['V6 verifies migration version uniqueness', v6.includes('verify-migration-version-uniqueness.mjs')],
  ['V6 performs clean Supabase reconstruction', v6.includes('supabase@2.117.0') && v6.includes('db reset --local') && v6.includes('supabase/migrations')],
  ['V6 restores missing production agent status migration in disposable replay', exists(agentStatusReplayPath) && v6.includes('prepare-clean-agent-status-replay.mjs') && agentStatusReplay.includes("20260902015029") && agentStatusReplay.includes("alter type agent.run_status add value if not exists 'SUCCEEDED'") && agentStatusReplay.includes("alter type agent.step_status add value if not exists 'SUCCEEDED'")],
  ['V6 reconstructs missing governance intelligence prerequisites', exists(governanceIntelligenceReplayPath) && v6.includes('prepare-clean-governance-intelligence-replay.mjs') && ['governance.critical_data_elements','governance.cde_mappings','governance.dataset_certifications','governance.knowledge_requirements','governance.regulatory_applicability'].every((token) => governanceIntelligenceReplay.includes(token))],
  ['recovered core replay leaves canonical policy/RPC ownership to September 5 migration', !coreReplay.includes('create policy') && !coreReplay.includes('grant select') && !coreReplay.includes('search_governance_knowledge_lexical')],
  ['recovered operational replay leaves canonical policy/grant ownership to September 5 migration', operationalStart >= 0 && !operationalReplay.includes('create policy') && !operationalReplay.includes('grant select') && !operationalReplay.includes('enable row level security')],
  ['governance intelligence replay preserves later review migration ownership', !governanceIntelligenceReplay.includes('reviewed_by uuid') && !governanceIntelligenceReplay.includes('reviewed_at timestamptz') && !governanceIntelligenceReplay.includes('review_comment text')],
  ['V6 repairs historical control-evidence parser defect only in disposable replay', exists(controlEvidenceReplayPath) && v6.includes('prepare-clean-control-evidence-syntax-replay.mjs') && controlEvidenceReplay.includes('20260905064557_automated_governance_control_evidence_collection.sql') && controlEvidenceReplay.includes('Expected exactly one historical LINEAGE predicate parser defect') && controlEvidenceReplay.includes('source.replace(broken, repaired)')],
  ['V6 preserves unavailable live database evidence as NOT_MEASURED', v6.includes('Record live governance database verification state') && v6.includes('Status: NOT_MEASURED in CI') && v6.includes("if: ${{ env.NEXT_PUBLIC_SUPABASE_URL != '' && env.SUPABASE_SERVICE_ROLE_KEY != '' }}")],
  ['V6 executes authenticated live database contracts when credentials exist', v6.includes('pnpm run verify:database') && v6.includes('SUPABASE_SERVICE_ROLE_KEY')],
  ['V6 exercises provider failure/fallback behavior', v6.includes('pnpm run verify:provider-fallback')],
  ['V6 exercises worker isolation and capacity', v6.includes('pnpm run verify:worker-runtime')],
  ['V6 exercises privileged API authorization audit', v6.includes('audit-user-facing-admin-routes.mjs')],
  ['V6 exercises governed AI execution controls', v6.includes('pnpm run verify:execution-controller') && v6.includes('pnpm run verify:model-gateway')],
  ['V6 exercises retrieval grounding/evaluation', v6.includes('pnpm run verify:retrieval-provider') && v6.includes('pnpm run verify:evaluation-engine')],
  ['V6 measures live production concurrency and latency', v6.includes('runtime-slo:') && v6.includes('pnpm run benchmark:production') && v6.includes("BENCHMARK_CONCURRENCY: '10'")],
  ['V6 retains an isolated recovery drill implementation', packageJson.scripts?.['recovery:drill'] === 'node scripts/recovery-drill.mjs' && exists('scripts/recovery-drill.mjs')],
  ['CodeQL is pinned to an immutable commit', codeql.includes('github/codeql-action/init@b96794f015dfd88f77b49b1c93e0fa7110f94c63') && codeql.includes('github/codeql-action/analyze@b96794f015dfd88f77b49b1c93e0fa7110f94c63')],
  ['dependency audit is lockfile-exact and blocks high severity vulnerabilities', dependency.includes('pnpm install --frozen-lockfile') && dependency.includes('pnpm audit --prod --audit-level high')],
  ['synthetic contract remains non-authoritative', syntheticAuthorityMigration.includes("'DRAFT','UNVERIFIED',null") && syntheticAuthorityMigration.includes("'data_contract_authority_fail_closed',true") && syntheticAuthorityMigration.includes("v_contract_result->>'status'='NO_CONTRACT'")],
  ['synthetic suite does not manufacture contract approval evidence', !syntheticAuthorityMigration.includes('approved_by=p_reviewer') && !syntheticAuthorityMigration.includes("authority_status='APPROVED'") && syntheticAuthorityMigration.includes('never manufacture human approval evidence')],
  ['OpenSearch remains optional rather than a release dependency', Boolean(packageJson.scripts?.['bootstrap:opensearch']) && !Object.keys(packageJson.dependencies ?? {}).some((name) => name.toLowerCase().includes('opensearch'))],
  ['ClickHouse is not introduced without measured need', !Object.keys(packageJson.dependencies ?? {}).some((name) => name.toLowerCase().includes('clickhouse'))],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`V6 operational certification verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`V6 operational certification contract passed (${checks.length} checks).`)

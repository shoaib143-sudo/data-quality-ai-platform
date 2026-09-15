import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260915130000_fix_synthetic_governance_readiness_fixture.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const checks = [
  ["source_type,'JDBC'", 'synthetic source must use the onboarded JDBC readiness policy'],
  ['data_source_id,metadata', 'synthetic dataset must bind the governed data source'],
  ['insert into catalog.source_scopes', 'synthetic fixture must create a governed source scope'],
  ['insert into catalog.source_scope_versions', 'synthetic fixture must create a governed scope version'],
  ['current_version_id=v_scope_version_id', 'synthetic scope version must become current'],
  ["'COMPLETED',1,jsonb_build_object('synthetic',true)", 'synthetic discovery run must be completed'],
  ['insert into catalog.discovered_assets', 'synthetic fixture must persist a current discovered asset'],
  ['insert into catalog.discovery_manifests', 'synthetic fixture must persist discovery manifest evidence'],
  ['false,true,encode(digest', 'synthetic manifest must be non-truncated and complete'],
  ['insert into profiling.dataset_execution_sources', 'synthetic dataset version must have an active execution binding'],
  ['catalog.verify_dataset_profile_readiness(v_project_id,v_dataset_id)', 'fixture must prove deterministic readiness before profiling'],
  ["raise exception 'Synthetic governed JDBC readiness fixture did not reach READY'", 'fixture must fail closed when readiness is not READY'],
  ["strpos(v_source,v_fixture_old)=0", 'migration must fail closed if the historical suite shape changed'],
  ['create or replace function governance.run_synthetic_governance_integration_suite()', 'migration must patch the existing synthetic suite rather than bypass the profile readiness trigger'],
]

let failed = false
for (const [needle, message] of checks) {
  if (!sql.includes(needle)) {
    console.error(`FAIL: ${message}`)
    failed = true
  } else {
    console.log(`PASS: ${message}`)
  }
}

const forbidden = [
  ['disable trigger', 'readiness enforcement must not be disabled'],
  ['session_replication_role', 'trigger enforcement must not be bypassed'],
  ["source_type,'CSV'", 'fixture must not use a non-onboarded readiness source type'],
  ['profiling_ready\',true)) returning id into v_dataset_id;\n    insert into catalog.dataset_versions', 'metadata flags alone must not be treated as readiness evidence'],
]

for (const [needle, message] of forbidden) {
  if (sql.toLowerCase().includes(needle.toLowerCase())) {
    console.error(`FAIL: ${message}`)
    failed = true
  } else {
    console.log(`PASS: ${message}`)
  }
}

if (failed) process.exit(1)
console.log('Synthetic governance readiness fixture contract verified.')

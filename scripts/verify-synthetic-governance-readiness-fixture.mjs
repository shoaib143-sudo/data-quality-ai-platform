import fs from 'node:fs'

const migrationPath = process.env.SYNTHETIC_READINESS_MIGRATION_PATH
  ?? 'supabase/migrations/20260915130000_fix_synthetic_governance_readiness_fixture.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const checks = [
  ["values(v_project_id,'Synthetic JDBC Source '||left(v_suffix,12),'JDBC'", 'synthetic source must use the onboarded JDBC readiness policy'],
  ['data_source_id,metadata', 'synthetic dataset must bind the governed data source'],
  ['insert into catalog.source_scopes', 'synthetic fixture must create a governed source scope'],
  ['insert into catalog.source_scope_versions', 'synthetic fixture must create a governed scope version'],
  ["jsonb_build_object('include',jsonb_build_array('profiling_validation.synthetic_customers'))", 'scope rules must use valid PostgreSQL JSON array construction'],
  ['current_version_id=v_scope_version_id', 'synthetic scope version must become current'],
  ["'COMPLETED',1,jsonb_build_object('synthetic',true)", 'synthetic discovery run must be completed'],
  ['insert into catalog.discovered_assets', 'synthetic fixture must persist a current discovered asset'],
  ['insert into catalog.discovery_manifests', 'synthetic fixture must persist discovery manifest evidence'],
  ['false,true,encode(digest', 'synthetic manifest must be non-truncated and complete'],
  ['insert into profiling.dataset_execution_sources', 'synthetic dataset version must have an active execution binding'],
  ['catalog.verify_dataset_profile_readiness(v_project_id,v_dataset_id)', 'fixture must prove deterministic readiness before profiling'],
  ["raise exception 'Synthetic governed JDBC readiness fixture did not reach READY'", 'fixture must fail closed when readiness is not READY'],
  ['strpos(v_source,v_fixture_old)=0', 'migration must fail closed if the historical suite shape changed'],
  ['v_patched := replace(v_patched,v_fixture_old,v_fixture_new)', 'migration must replace the exact historical fixture with governed readiness evidence'],
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
  ["values(v_project_id,'Synthetic JDBC Source '||left(v_suffix,12),'CSV'", 'fixture must not use a non-onboarded readiness source type'],
  ["jsonb_build_object('include',['profiling_validation.synthetic_customers'])", 'scope rules must not use JavaScript-style array syntax in SQL'],
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

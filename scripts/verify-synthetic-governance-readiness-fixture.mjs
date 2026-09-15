import fs from 'node:fs'

const migrations = [
  {
    path: 'supabase/migrations/20260915130000_fix_synthetic_governance_readiness_fixture.sql',
    failClosedMarkers: [
      'strpos(v_source,v_fixture_old)=0',
      'v_patched := replace(v_patched,v_fixture_old,v_fixture_new)',
    ],
  },
  {
    path: 'supabase/migrations/20260915131000_reconcile_synthetic_governance_readiness_fixture.sql',
    failClosedMarkers: [
      'strpos(v_source,v_decl_anchor)=0',
      'strpos(v_source,v_fixture_compact)=0',
      'v_patched := replace(v_source,v_decl_anchor,v_decl_new)',
      'v_patched := replace(v_patched,v_fixture_compact,v_fixture_new)',
    ],
  },
]

const requiredChecks = [
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
  ['create or replace function governance.run_synthetic_governance_integration_suite()', 'migration must patch the existing synthetic suite rather than bypass the profile readiness trigger'],
]

const forbidden = [
  ['disable trigger', 'readiness enforcement must not be disabled'],
  ['session_replication_role', 'trigger enforcement must not be bypassed'],
  ["values(v_project_id,'Synthetic JDBC Source '||left(v_suffix,12),'CSV'", 'fixture must not use a non-onboarded readiness source type'],
  ["jsonb_build_object('include',['profiling_validation.synthetic_customers'])", 'scope rules must not use JavaScript-style array syntax in SQL'],
]

const hashResolutionPath = 'supabase/migrations/20260915185000_harden_synthetic_readiness_hash_resolution.sql'

let failed = false

for (const migration of migrations) {
  const sql = fs.readFileSync(migration.path, 'utf8')
  console.log(`VERIFY ${migration.path}`)

  for (const [needle, message] of requiredChecks) {
    if (!sql.includes(needle)) {
      console.error(`FAIL: ${message}`)
      failed = true
    } else {
      console.log(`PASS: ${message}`)
    }
  }

  for (const marker of migration.failClosedMarkers) {
    if (!sql.includes(marker)) {
      console.error(`FAIL: migration must retain fail-closed reconciliation marker: ${marker}`)
      failed = true
    } else {
      console.log(`PASS: fail-closed reconciliation marker retained: ${marker}`)
    }
  }

  for (const [needle, message] of forbidden) {
    if (sql.toLowerCase().includes(needle.toLowerCase())) {
      console.error(`FAIL: ${message}`)
      failed = true
    } else {
      console.log(`PASS: ${message}`)
    }
  }
}

const hashResolutionSql = fs.readFileSync(hashResolutionPath, 'utf8')
for (const [needle, message] of [
  ['pg_catalog.encode(extensions.digest(', 'runtime hashes must resolve pgcrypto under the restricted search path'],
  ["strpos(v_source, 'encode(digest(') = 0", 'hash hardening must fail closed when the historical expression changes'],
  ['revoke execute on function governance.run_synthetic_governance_integration_suite() from public, anon, authenticated', 'hash hardening must preserve the suite ACL boundary'],
]) {
  if (!hashResolutionSql.includes(needle)) {
    console.error(`FAIL: ${message}`)
    failed = true
  } else {
    console.log(`PASS: ${message}`)
  }
}

if (failed) process.exit(1)
console.log('Synthetic governance readiness fixture and reconciliation contracts verified.')

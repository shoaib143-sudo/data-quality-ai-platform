import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase/migrations');
const migrationNames = fs.readdirSync(migrationsDir);
const ledgerMigrations = migrationNames.filter((name) =>
  name.endsWith('_run_scoped_ai_capability_e2e_evidence.sql'),
);
const seedFixMigrations = migrationNames.filter((name) =>
  name.endsWith('_fix_ai_capability_e2e_run_seed_contract.sql'),
);

if (ledgerMigrations.length !== 1) {
  throw new Error(`Expected exactly one run-scoped capability evidence migration, found ${ledgerMigrations.length}.`);
}
if (seedFixMigrations.length !== 1) {
  throw new Error(`Expected exactly one capability seed-contract fix migration, found ${seedFixMigrations.length}.`);
}

const ledgerMigration = fs.readFileSync(path.join(migrationsDir, ledgerMigrations[0]), 'utf8');
const seedFixMigration = fs.readFileSync(path.join(migrationsDir, seedFixMigrations[0]), 'utf8');
const migration = `${ledgerMigration}\n${seedFixMigration}`;
const workflowPath = path.join(root, '.github/workflows/ai-capability-e2e-ledger.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

const checks = [
  ['75-row run invariant', /capability_count\s*=\s*75/i, migration],
  ['canonical matrix seeds identities', /generate_ai_capability_matrix\(p_project_id\)/, migration],
  ['current matrix columns seed results', /insert into governance\.ai_capability_e2e_results[\s\S]*?m\.capability_id,[\s\S]*?m\.evidence_domain,[\s\S]*?m\.capability[\s\S]*?generate_ai_capability_matrix\(p_project_id\)/i, seedFixMigration],
  ['execution state is explicit', /execution_state[\s\S]*?'NOT_RUN'[\s\S]*?'EXECUTED'[\s\S]*?'BLOCKED'[\s\S]*?'FAILED'/i, ledgerMigration],
  ['verification state is independent', /verification_state[\s\S]*?'UNKNOWN'[\s\S]*?'VERIFIED'[\s\S]*?'FAILED'[\s\S]*?'INCONCLUSIVE'/i, ledgerMigration],
  ['executed requires run-scoped evidence', /EXECUTED capability requires run-scoped execution evidence/, ledgerMigration],
  ['verified requires separate authoritative evidence', /VERIFIED capability requires separate authoritative verification evidence/, ledgerMigration],
  ['authoritative fact truth class', /'AUTHORITATIVE FACT'/, ledgerMigration],
  ['observed evidence truth class', /'OBSERVED EVIDENCE'/, ledgerMigration],
  ['derived intelligence truth class', /'DERIVED INTELLIGENCE'/, ledgerMigration],
  ['governed decision truth class', /'GOVERNED DECISION'/, ledgerMigration],
  ['same-project dataset scope', /belongs to a different project/, ledgerMigration],
  ['canonical entity project resolver', /ai_capability_e2e_entity_project/, ledgerMigration],
  ['append-only evidence trigger', /ai_capability_e2e_evidence_immutable/, ledgerMigration],
  ['evidence mutation rejected', /run-scoped capability evidence is append-only/, ledgerMigration],
  ['restrictive client RLS', /as restrictive[\s\S]*?to anon, authenticated[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/i, ledgerMigration],
  ['direct service-role mutation revoked', /revoke all on table governance\.ai_capability_e2e_evidence from public, anon, authenticated, service_role/i, ledgerMigration],
  ['service-role read is explicit', /grant select on table governance\.ai_capability_e2e_evidence to service_role/i, ledgerMigration],
  ['service-role orchestration execute is explicit', /grant execute on function governance\.append_ai_capability_e2e_evidence[\s\S]*?to service_role/i, ledgerMigration],
  ['seed fix preserves service-role orchestration', /grant execute on function governance\.create_ai_capability_e2e_run\(uuid, jsonb\)[\s\S]*?to service_role/i, seedFixMigration],
  ['malformed zero-dataset run cannot finalize', /must include at least one dataset version/, ledgerMigration],
  ['malformed result count cannot finalize', /has % result rows instead of 75/, ledgerMigration],
  ['PASS requires all 75 executed and verified', /v_executed_count = 75 and v_verified_count = 75/, ledgerMigration],
  ['project-wide evidence alone cannot prove execution', /Project-wide matrix evidence alone is never run execution proof/, ledgerMigration],
  ['future temporal evidence fails closed', /not materially future-dated/, ledgerMigration],
  ['dedicated workflow invokes verifier', /verify-ai-capability-e2e-ledger\.mjs/, workflow],
  ['dedicated workflow checks migration uniqueness', /verify-migration-version-uniqueness\.mjs/, workflow],
];

const failures = [];
for (const [name, pattern, source] of checks) {
  if (!pattern.test(source)) failures.push(name);
}

if (/\bm\.(?:evidence_count|evidence_source|status)\b/.test(seedFixMigration)) {
  failures.push('project-wide inventory evidence must not be copied into run execution results');
}

if (failures.length) {
  console.error('AI capability E2E ledger contract FAILED:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`AI capability E2E ledger contract PASS (${checks.length + 1}/${checks.length + 1} checks).`);

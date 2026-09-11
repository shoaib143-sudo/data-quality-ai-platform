import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/20260911083000_run_scoped_ai_capability_e2e_evidence.sql',
);
const workflowPath = path.join(root, '.github/workflows/ai-capability-e2e-ledger.yml');

const migration = fs.readFileSync(migrationPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');

const checks = [
  ['75-row run invariant', /capability_count\s*=\s*75/i, migration],
  ['canonical matrix seeds identities', /generate_ai_capability_matrix\(p_project_id\)/, migration],
  ['matrix evidence is not copied into results', /insert into governance\.ai_capability_e2e_results[\s\S]*?m\.sr_no,[\s\S]*?m\.module,[\s\S]*?m\.capability/i, migration],
  ['execution state is explicit', /execution_state[\s\S]*?'NOT_RUN'[\s\S]*?'EXECUTED'[\s\S]*?'BLOCKED'[\s\S]*?'FAILED'/i, migration],
  ['verification state is independent', /verification_state[\s\S]*?'UNKNOWN'[\s\S]*?'VERIFIED'[\s\S]*?'FAILED'[\s\S]*?'INCONCLUSIVE'/i, migration],
  ['executed requires run-scoped evidence', /EXECUTED capability requires run-scoped execution evidence/, migration],
  ['verified requires separate authoritative evidence', /VERIFIED capability requires separate authoritative verification evidence/, migration],
  ['authoritative fact truth class', /'AUTHORITATIVE FACT'/, migration],
  ['observed evidence truth class', /'OBSERVED EVIDENCE'/, migration],
  ['derived intelligence truth class', /'DERIVED INTELLIGENCE'/, migration],
  ['governed decision truth class', /'GOVERNED DECISION'/, migration],
  ['same-project dataset scope', /belongs to a different project/, migration],
  ['canonical entity project resolver', /ai_capability_e2e_entity_project/, migration],
  ['append-only evidence trigger', /ai_capability_e2e_evidence_immutable/, migration],
  ['evidence mutation rejected', /run-scoped capability evidence is append-only/, migration],
  ['restrictive client RLS', /as restrictive[\s\S]*?to anon, authenticated[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/i, migration],
  ['direct service-role mutation revoked', /revoke all on table governance\.ai_capability_e2e_evidence from public, anon, authenticated, service_role/i, migration],
  ['service-role read is explicit', /grant select on table governance\.ai_capability_e2e_evidence to service_role/i, migration],
  ['service-role orchestration execute is explicit', /grant execute on function governance\.append_ai_capability_e2e_evidence[\s\S]*?to service_role/i, migration],
  ['malformed zero-dataset run cannot finalize', /must include at least one dataset version/, migration],
  ['malformed result count cannot finalize', /has % result rows instead of 75/, migration],
  ['PASS requires all 75 executed and verified', /v_executed_count = 75 and v_verified_count = 75/, migration],
  ['project-wide evidence alone cannot prove execution', /Project-wide matrix evidence alone is never run execution proof/, migration],
  ['future temporal evidence fails closed', /not materially future-dated/, migration],
  ['dedicated workflow invokes verifier', /verify-ai-capability-e2e-ledger\.mjs/, workflow],
  ['dedicated workflow checks migration uniqueness', /verify-migration-version-uniqueness\.mjs/, workflow],
];

const failures = [];
for (const [name, pattern, source] of checks) {
  if (!pattern.test(source)) failures.push(name);
}

if (failures.length) {
  console.error('AI capability E2E ledger contract FAILED:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`AI capability E2E ledger contract PASS (${checks.length}/${checks.length} checks).`);

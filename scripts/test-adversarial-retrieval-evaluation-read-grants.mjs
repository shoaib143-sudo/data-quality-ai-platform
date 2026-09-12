import fs from 'node:fs'

const foundation = fs.readFileSync('supabase/migrations/20260909010519_adr006_governed_retrieval_relevance_labels.sql', 'utf8')
const repair = fs.readFileSync('supabase/migrations/20260913031500_retrieval_evaluation_read_grants.sql', 'utf8')
const repairSql = repair
  .replace(/--.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const failures = []

const requireText = (source, token, label) => {
  if (!source.includes(token)) failures.push(`missing ${label}: ${token}`)
}

// Independent authority oracle: project isolation must remain enforced by the
// original row-security contract and the effective view must execute as caller.
requireText(foundation, 'alter table governance.ai_retrieval_evaluation_case_versions enable row level security;', 'case-version RLS')
requireText(foundation, 'alter table governance.ai_retrieval_relevance_judgments enable row level security;', 'judgment RLS')
requireText(foundation, 'using (app_private.is_project_member(project_id));', 'project-membership RLS predicate')
requireText(foundation, 'with (security_invoker = true)', 'security-invoker effective view')

for (const object of [
  'governance.ai_retrieval_evaluation_case_versions',
  'governance.ai_retrieval_relevance_judgments',
  'governance.ai_retrieval_evaluation_case_effective',
]) {
  requireText(repairSql, `revoke all on ${object} from anon;`, `anonymous denial for ${object}`)
  requireText(repairSql, `grant select on ${object} to authenticated;`, `authenticated read-only grant for ${object}`)
  requireText(repairSql, `grant select on ${object} to service_role;`, `service-role read grant for ${object}`)
}

// Attack oracle: inspect executable SQL only so explanatory comments cannot
// satisfy or trip the privilege patterns. The repair must not gain a mutation,
// anonymous, public, or authority-bypass capability.
for (const forbidden of [
  /grant\s+(?:insert|update|delete|truncate|references|trigger|all)\b[^;]*\bto\s+authenticated\b/i,
  /grant\s+select\b[^;]*\bto\s+anon\b/i,
  /grant\s+[^;]+\bto\s+public\b/i,
  /disable\s+row\s+level\s+security/i,
  /security_definer/i,
  /alter\s+policy/i,
  /drop\s+policy/i,
]) {
  if (forbidden.test(repairSql)) failures.push(`forbidden grant-boundary weakening: ${forbidden}`)
}

if (failures.length) {
  console.error('Adversarial retrieval-evaluation read-grant audit failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}

console.log('Adversarial retrieval-evaluation read-grant boundary verified: read restored, authority unchanged.')

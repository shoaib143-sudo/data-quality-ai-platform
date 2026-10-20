import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync('supabase/migrations/20261020043616_learning_evaluation_trusted_assignments.sql', 'utf8')

assert.match(sql, /create table if not exists agent\.learning_evaluation_assignments/i)
assert.match(sql, /proposer_user_id uuid not null references auth\.users\(id\) on delete restrict/i)
assert.match(sql, /evaluator_user_id uuid not null references auth\.users\(id\) on delete restrict/i)
assert.match(sql, /check \(proposer_user_id <> evaluator_user_id\)/i)
assert.match(sql, /scope_digest text not null check \(scope_digest ~ '\^sha256:\[0-9a-f\]\{64\}\$'\)/i)
assert.match(sql, /learning_evaluation_assignment_mutation[\s\S]*?before update or delete/i)
assert.match(sql, /create table if not exists agent\.learning_evaluation_assignment_acknowledgements/i)
assert.match(sql, /acknowledged_by_user_id uuid not null references auth\.users\(id\) on delete restrict/i)
assert.match(sql, /before update or delete on agent\.learning_evaluation_assignment_acknowledgements/i)
assert.match(sql, /grant execute on function agent\.record_learning_evaluation_assignment\(uuid,uuid,uuid,uuid,uuid,uuid\)\s+to service_role/i)
assert.match(sql, /grant execute on function agent\.record_learning_evaluation_assignment_acknowledgement\(uuid,uuid,uuid\)\s+to service_role/i)
assert.doesNotMatch(sql, /grant execute on function agent\.record_learning_evaluation_assignment(?:_acknowledgement)?\([^;]+\)\s+to authenticated/i)
assert.match(sql, /extensions\.digest\(convert_to\(to_jsonb\(v_policy\)::text, 'UTF8'\), 'sha256'\)/i)
assert.match(sql, /before insert on agent\.learning_evaluation_results/i)
assert.match(sql, /acknowledged evaluator assignment is required before result recording/i)
assert.match(sql, /alter table agent\.learning_evaluation_assignments enable row level security/i)
assert.match(sql, /alter table agent\.learning_evaluation_assignment_acknowledgements enable row level security/i)
assert.doesNotMatch(sql, /grant (?:insert|update|delete|all) on agent\.learning_evaluation_(?:assignments|assignment_acknowledgements) to (?:public|anon|authenticated)/i)

console.log('PASS migration contract binds immutable UUID-backed assignments and acknowledgements to policy scope')
console.log('PASS evaluator result writes require acknowledgement and assignment RPCs are service-role-only')
console.log('NOTE SQL was statically checked only. No PostgreSQL or Supabase migration was run.')

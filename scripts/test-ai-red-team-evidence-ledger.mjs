import assert from 'node:assert/strict'
import fs from 'node:fs'
const sql=fs.readFileSync('supabase/migrations/20260912190000_ai_red_team_evidence.sql','utf8')

assert.match(sql,/source_commit_sha\s+text\s+not null\s+check\s*\(source_commit_sha ~ '\^\[0-9a-f\]\{40\}\$'\)/)
assert.match(sql,/deployment_id\s+text\s+not null/)
assert.match(sql,/scenario_id text not null check \(scenario_id in/)
assert.match(sql,/production_representative boolean not null default false/)
assert.match(sql,/before update or delete on governance\.ai_red_team_evidence/)
assert.match(sql,/revoke all on table governance\.ai_red_team_evidence from public, anon, authenticated, service_role/)
assert.match(sql,/grant select on table governance\.ai_red_team_evidence to service_role/)
assert.match(sql,/revoke execute on function governance\.record_ai_red_team_evidence[\s\S]*from public, anon, authenticated/)
assert.match(sql,/grant execute on function governance\.record_ai_red_team_evidence[\s\S]*to service_role/)
assert.match(sql,/where v\.id = p_ai_system_version_id and v\.project_id = p_project_id/)
assert.match(sql,/p_observed_at > now\(\) \+ interval '5 minutes'/)
assert.match(sql,/jsonb_array_length\(p_evidence_refs\) = 0/)
assert.match(sql,/v_scenario = 'ABSTENTION_FAILURE'/)
assert.match(sql,/extensions\.digest/)
assert.equal(/grant\s+(insert|update|delete|all).*ai_red_team_evidence.*authenticated/i.test(sql),false)
assert.equal(/grant\s+(insert|update|delete|all).*ai_red_team_evidence.*service_role/i.test(sql),false)

console.log('AI red-team evidence ledger negative authority tests passed.')

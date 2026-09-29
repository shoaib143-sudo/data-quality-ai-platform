import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync('scripts/test-learning-prospective-outcome-fixture.sql', 'utf8')
const runner = fs.readFileSync('scripts/run-learning-prospective-outcome-fixture.sh', 'utf8')
const workflow = fs.readFileSync('.github/workflows/delegation-admin-policy.yml', 'utf8')

for (const marker of [
  "fixture_guard=ISOLATED_PROSPECTIVE_OUTCOME_FIXTURE",
  "current_setting('app.fixture_guard', true) <> 'ISOLATED_PROSPECTIVE_OUTCOME_FIXTURE'",
  "('SUCCEEDED', '{\"learningRunMode\":\"SUPERVISED\"}'::jsonb",
  "('PARTIAL', '{\"run_mode\":\"HANDSFREE\"}'::jsonb",
  "('FAILED', '{\"run_mode\":\"GUIDED\"}'::jsonb",
  "('CANCELLED', '{\"learningRunMode\":\"FULL_AUTONOMOUS\",\"run_mode\":\"GUIDED\"}'::jsonb",
  'prospective outcome appeared before delayed verification',
  'delayed verified outcome was not collected',
  'failed guided run was not captured in denominator',
  'partial handsfree run was not captured in denominator',
  'run_mode = \'UNCLASSIFIED\'',
  'rollback;',
]) assert.ok(sql.includes(marker), `fixture missing invariant: ${marker}`)

assert.match(runner, /localhost|127\.0\.0\.1|host\.docker\.internal/)
assert.match(runner, /Refusing to run the fixture against a non-local database/)
assert.match(workflow, /supabase@2\.117\.0 db reset --local/)
assert.match(workflow, /run-learning-prospective-outcome-fixture\.sh/)
assert.doesNotMatch(runner, /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|vercel\.app/)

console.log('Isolated prospective-outcome fixture contract passed: local-only guard, delayed verification, explicit modes, terminal failures, and rollback are covered.')

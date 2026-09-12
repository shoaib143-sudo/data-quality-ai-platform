#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
RUN_ID='71111111-1111-4111-8111-111111111111'
MANIFEST_ID='72222222-2222-4222-8222-222222222222'
INV_ID='73333333-3333-4333-8333-333333333333'
TOOL_DEF='74444444-4444-4444-8444-444444444444'
AGENT_DEF='75555555-5555-4555-8555-555555555555'
PROJECT_ID='76666666-6666-4666-8666-666666666666'
OWNER_1='baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
OWNER_2='baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
HASH='sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
OUT='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

q() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atqc "$1"; }
assert_eq() {
  [[ "$1" == "$2" ]] || { echo "ASSERTION FAILED: $3 expected=$2 actual=$1" >&2; exit 1; }
  echo "PASS: $3"
}
expect_fail() {
  local out
  out="$(mktemp)"
  if psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atqc "$3" >"$out" 2>&1; then
    echo "ASSERTION FAILED: $1 unexpectedly succeeded" >&2; rm -f "$out"; exit 1
  fi
  grep -Eqi "$2" "$out" || { cat "$out" >&2; rm -f "$out"; echo "ASSERTION FAILED: $1 wrong failure" >&2; exit 1; }
  rm -f "$out"
  echo "PASS: $1"
}

psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
SET session_replication_role = replica;
INSERT INTO agent.agent_runs (id, agent_definition_id, project_id, status, input)
VALUES ('$RUN_ID', '$AGENT_DEF', '$PROJECT_ID', 'RUNNING', '{}'::jsonb);
INSERT INTO agent.agent_run_runtime_manifests (
  id, agent_run_id, agent_definition_id, agent_key, agent_version, runtime_version,
  definition_snapshot, definition_hash, tool_contracts, tool_contract_set_hash, manifest_hash
) VALUES (
  '$MANIFEST_ID', '$RUN_ID', '$AGENT_DEF', 'lease_timing_fixture', '1.0.0', 'test',
  '{}'::jsonb, '$HASH',
  jsonb_build_object('primary', jsonb_build_object('execution_config', jsonb_build_object('compensation_tool_key', 'compensate'))),
  '$HASH', '$HASH'
);
INSERT INTO agent.agent_tool_invocations (
  id, agent_run_id, runtime_manifest_id, tool_definition_id, tool_key, tool_version,
  contract_hash, executor_key, read_only, idempotent, input_hash, status, idempotency_key
) VALUES (
  '$INV_ID', '$RUN_ID', '$MANIFEST_ID', '$TOOL_DEF', 'compensate', '1.0.0',
  '$HASH', 'fixture', false, true, '$HASH', 'ADMITTED', 'recovery:lease-timing'
);
SET session_replication_role = origin;
SQL

initial="$(q "select concat_ws('|',r->>'claimed',r->>'generation',r->>'reason') from (select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_ID','$OWNER_1',15) r) s")"
assert_eq "$initial" 'true|1|INITIAL_CLAIM' '15-second lease can be claimed'

sleep 8
renewed="$(q "select concat_ws('|',r->>'claimed',r->>'generation',r->>'reason') from (select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_ID','$OWNER_1',15) r) s")"
assert_eq "$renewed" 'true|1|LEASE_RENEWED' 'healthy owner renews lease before expiry'

# The original 15-second window has now elapsed, but the renewal must still protect execution.
sleep 8
blocked="$(q "select concat_ws('|',r->>'claimed',r->>'generation',r->>'owner_id',r->>'reason') from (select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_ID','$OWNER_2',15) r) s")"
assert_eq "$blocked" "false|1|$OWNER_1|ACTIVE_LEASE" 'renewal keeps healthy long-running compensation from being reclaimed'

# Stop renewing to model a crashed/lost worker. After the renewed window expires, replacement can reclaim.
sleep 8
reclaimed="$(q "select concat_ws('|',r->>'claimed',r->>'generation',r->>'owner_id',r->>'reason') from (select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_ID','$OWNER_2',15) r) s")"
assert_eq "$reclaimed" "true|2|$OWNER_2|STALE_LEASE_RECLAIMED" 'real elapsed lease expiry permits generation-2 reclaim'

expect_fail 'old worker is fenced after real expiry/reclaim' 'COMPENSATION_FENCED' \
  "select agent.complete_compensation_tool_invocation_internal('$INV_ID','$OWNER_1',1,'SUCCEEDED','$OUT',null,null);"

completed="$(q "select concat_ws('|',r->>'status',r->>'generation') from (select agent.complete_compensation_tool_invocation_internal('$INV_ID','$OWNER_2',2,'SUCCEEDED','$OUT',null,null) r) s")"
assert_eq "$completed" 'SUCCEEDED|2' 'replacement owner completes after real expiry/reclaim'

printf '\nNative compensation real lease timing test passed.\n'

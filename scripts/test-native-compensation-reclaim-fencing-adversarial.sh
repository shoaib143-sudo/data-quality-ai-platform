#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
TMP_DIR="${RUNNER_TEMP:-/tmp}/native-compensation-adversarial-$$"
mkdir -p "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

RUN_ID='11111111-1111-4111-8111-111111111111'
MANIFEST_ID='22222222-2222-4222-8222-222222222222'
INV_SUCCESS='33333333-3333-4333-8333-333333333331'
INV_FAILED='33333333-3333-4333-8333-333333333332'
INV_ORDINARY='33333333-3333-4333-8333-333333333333'
TOOL_DEF='44444444-4444-4444-8444-444444444444'
AGENT_DEF='55555555-5555-4555-8555-555555555555'
PROJECT_ID='66666666-6666-4666-8666-666666666666'
OWNER_1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
OWNER_2='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
OWNER_3='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
HASH_A='sha256:1111111111111111111111111111111111111111111111111111111111111111'
HASH_B='sha256:2222222222222222222222222222222222222222222222222222222222222222'
HASH_OUT='sha256:3333333333333333333333333333333333333333333333333333333333333333'

psql_q() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atqc "$1"
}

assert_eq() {
  local actual="$1" expected="$2" label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "ASSERTION FAILED: $label" >&2
    echo "  expected: $expected" >&2
    echo "  actual:   $actual" >&2
    exit 1
  fi
  echo "PASS: $label"
}

expect_fail() {
  local label="$1" pattern="$2" sql="$3" out="$TMP_DIR/failure.log"
  if psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atqc "$sql" >"$out" 2>&1; then
    echo "ASSERTION FAILED: $label unexpectedly succeeded" >&2
    cat "$out" >&2
    exit 1
  fi
  if ! grep -Eqi "$pattern" "$out"; then
    echo "ASSERTION FAILED: $label failed for the wrong reason" >&2
    cat "$out" >&2
    exit 1
  fi
  echo "PASS: $label"
}

# Synthetic fixtures live only in the disposable local Supabase database. FK triggers are
# bypassed for fixture insertion, then normal trigger semantics are restored before any RPC
# under test executes.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
SET session_replication_role = replica;
INSERT INTO agent.agent_runs (id, agent_definition_id, project_id, status, input)
VALUES ('$RUN_ID', '$AGENT_DEF', '$PROJECT_ID', 'RUNNING', '{}'::jsonb);

INSERT INTO agent.agent_run_runtime_manifests (
  id, agent_run_id, agent_definition_id, agent_key, agent_version, runtime_version,
  definition_snapshot, definition_hash, tool_contracts, tool_contract_set_hash, manifest_hash
) VALUES (
  '$MANIFEST_ID', '$RUN_ID', '$AGENT_DEF', 'adversarial_fixture', '1.0.0', 'test',
  '{}'::jsonb, '$HASH_A',
  jsonb_build_object(
    'primary', jsonb_build_object('execution_config', jsonb_build_object('compensation_tool_key', 'compensate')),
    'compensate', jsonb_build_object('execution_config', '{}'::jsonb),
    'ordinary', jsonb_build_object('execution_config', '{}'::jsonb)
  ),
  '$HASH_A', '$HASH_B'
);

INSERT INTO agent.agent_tool_invocations (
  id, agent_run_id, runtime_manifest_id, tool_definition_id, tool_key, tool_version,
  contract_hash, executor_key, read_only, idempotent, input_hash, status, idempotency_key
) VALUES
  ('$INV_SUCCESS', '$RUN_ID', '$MANIFEST_ID', '$TOOL_DEF', 'compensate', '1.0.0', '$HASH_A', 'fixture', false, true, '$HASH_A', 'ADMITTED', 'recovery:success'),
  ('$INV_FAILED', '$RUN_ID', '$MANIFEST_ID', '$TOOL_DEF', 'compensate', '1.0.0', '$HASH_A', 'fixture', false, true, '$HASH_B', 'ADMITTED', 'recovery:failed'),
  ('$INV_ORDINARY', '$RUN_ID', '$MANIFEST_ID', '$TOOL_DEF', 'ordinary', '1.0.0', '$HASH_A', 'fixture', false, true, '$HASH_A', 'ADMITTED', 'ordinary:fixture');
SET session_replication_role = origin;
SQL

initial="$(psql_q "select concat_ws('|', r->>'claimed', r->>'generation', r->>'owner_id', r->>'reason') from (select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_SUCCESS','$OWNER_1',120) r) s")"
assert_eq "$initial" "true|1|$OWNER_1|INITIAL_CLAIM" "initial compensation claim creates generation 1"

active="$(psql_q "select concat_ws('|', r->>'claimed', r->>'generation', r->>'owner_id', r->>'reason') from (select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_SUCCESS','$OWNER_2',120) r) s")"
assert_eq "$active" "false|1|$OWNER_1|ACTIVE_LEASE" "competing owner cannot steal a live lease"

renewed="$(psql_q "select concat_ws('|', r->>'claimed', r->>'generation', r->>'owner_id', r->>'reason') from (select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_SUCCESS','$OWNER_1',120) r) s")"
assert_eq "$renewed" "true|1|$OWNER_1|LEASE_RENEWED" "same owner renews without generation change"

expect_fail "lease duration below floor is rejected" "between 15 and 900" \
  "select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_FAILED','$OWNER_1',5);"
expect_fail "non-recovery invocation cannot enter compensation state" "not a governed Recovery V2 compensation" \
  "select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_ORDINARY','$OWNER_1',120);"

# Simulate the original worker crashing by expiring its lease without invoking transition logic.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
SET session_replication_role = replica;
UPDATE agent.agent_tool_invocations
SET compensation_lease_expires_at = now() - interval '1 second'
WHERE id = '$INV_SUCCESS';
SET session_replication_role = origin;
SQL

# Two independent sessions race to reclaim the stale generation. The row-level FOR UPDATE lock
# must serialize them so exactly one advances generation and the other observes a live lease.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_SUCCESS','$OWNER_2',120);" \
  >"$TMP_DIR/owner2.out" 2>"$TMP_DIR/owner2.err" &
pid2=$!
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_SUCCESS','$OWNER_3',120);" \
  >"$TMP_DIR/owner3.out" 2>"$TMP_DIR/owner3.err" &
pid3=$!
wait "$pid2"
wait "$pid3"

wins=$(grep -h -c '"claimed": true' "$TMP_DIR/owner2.out" "$TMP_DIR/owner3.out" | awk '{s+=$1} END{print s+0}')
losses=$(grep -h -c '"reason": "ACTIVE_LEASE"' "$TMP_DIR/owner2.out" "$TMP_DIR/owner3.out" | awk '{s+=$1} END{print s+0}')
assert_eq "$wins" "1" "exactly one concurrent stale reclaimer wins"
assert_eq "$losses" "1" "losing concurrent reclaimer observes active lease"

winner="$(psql_q "select compensation_owner_id::text from agent.agent_tool_invocations where id='$INV_SUCCESS'")"
generation="$(psql_q "select compensation_generation::text from agent.agent_tool_invocations where id='$INV_SUCCESS'")"
assert_eq "$generation" "2" "stale reclaim advances generation exactly once"
if [[ "$winner" == "$OWNER_2" ]]; then loser="$OWNER_3"; elif [[ "$winner" == "$OWNER_3" ]]; then loser="$OWNER_2"; else
  echo "ASSERTION FAILED: unexpected reclaim winner $winner" >&2; exit 1
fi

authority_before="$(psql_q "select concat_ws('|',tool_key,executor_key,input_hash,idempotency_key) from agent.agent_tool_invocations where id='$INV_SUCCESS'")"
expect_fail "RUNNING invocation authority fields remain immutable" "authority fields are immutable" \
  "update agent.agent_tool_invocations set executor_key='tampered' where id='$INV_SUCCESS';"
authority_after="$(psql_q "select concat_ws('|',tool_key,executor_key,input_hash,idempotency_key) from agent.agent_tool_invocations where id='$INV_SUCCESS'")"
assert_eq "$authority_after" "$authority_before" "failed authority tamper leaves evidence unchanged"

expect_fail "generation 1 worker cannot record success after generation 2 reclaim" "COMPENSATION_FENCED" \
  "select agent.complete_compensation_tool_invocation_internal('$INV_SUCCESS','$OWNER_1',1,'SUCCEEDED','$HASH_OUT',null,null);"
expect_fail "generation 1 worker cannot record failure after generation 2 reclaim" "COMPENSATION_FENCED" \
  "select agent.complete_compensation_tool_invocation_internal('$INV_SUCCESS','$OWNER_1',1,'FAILED',null,'STALE','stale worker');"
expect_fail "losing generation 2 contender cannot finalize" "COMPENSATION_FENCED" \
  "select agent.complete_compensation_tool_invocation_internal('$INV_SUCCESS','$loser',2,'FAILED',null,'LOST','lost race');"
expect_fail "ordinary completion RPC cannot finalize RUNNING compensation" "not found or already terminal" \
  "select agent.complete_tool_invocation_internal('$INV_SUCCESS','SUCCEEDED','$HASH_OUT',null,null);"

completed="$(psql_q "select concat_ws('|', r->>'status', r->>'replayed', r->>'generation') from (select agent.complete_compensation_tool_invocation_internal('$INV_SUCCESS','$winner',2,'SUCCEEDED','$HASH_OUT',null,null) r) s")"
assert_eq "$completed" "SUCCEEDED|false|2" "current generation owner can complete successfully"

persisted="$(psql_q "select concat_ws('|',status,compensation_generation::text,compensation_owner_id::text,output_hash) from agent.agent_tool_invocations where id='$INV_SUCCESS'")"
assert_eq "$persisted" "SUCCEEDED|2|$winner|$HASH_OUT" "successful fenced completion persists verified terminal evidence"

replay="$(psql_q "select concat_ws('|', r->>'status', r->>'replayed', r->>'generation') from (select agent.complete_compensation_tool_invocation_internal('$INV_SUCCESS','$winner',2,'SUCCEEDED','$HASH_OUT',null,null) r) s")"
assert_eq "$replay" "SUCCEEDED|true|2" "same fenced terminal completion is idempotently replayable"

terminal_claim="$(psql_q "select concat_ws('|', r->>'claimed', r->>'status', r->>'reason', r->>'generation') from (select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_SUCCESS','$OWNER_1',120) r) s")"
assert_eq "$terminal_claim" "false|SUCCEEDED|TERMINAL|2" "terminal success cannot be reclaimed"
expect_fail "superseded owner stays fenced after terminal success" "COMPENSATION_FENCED" \
  "select agent.complete_compensation_tool_invocation_internal('$INV_SUCCESS','$OWNER_1',1,'FAILED',null,'STALE','stale');"

failed_claim="$(psql_q "select concat_ws('|', r->>'claimed', r->>'generation', r->>'owner_id') from (select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_FAILED','$OWNER_1',120) r) s")"
assert_eq "$failed_claim" "true|1|$OWNER_1" "failure fixture can be claimed"
failed_complete="$(psql_q "select concat_ws('|', r->>'status', r->>'replayed', r->>'generation') from (select agent.complete_compensation_tool_invocation_internal('$INV_FAILED','$OWNER_1',1,'FAILED',null,'EXPECTED_FAILURE','adversarial failure') r) s")"
assert_eq "$failed_complete" "FAILED|false|1" "current owner can persist governed failure"
failed_reclaim="$(psql_q "select concat_ws('|', r->>'claimed', r->>'status', r->>'reason') from (select agent.claim_compensation_tool_invocation_internal('$RUN_ID','$INV_FAILED','$OWNER_2',120) r) s")"
assert_eq "$failed_reclaim" "false|FAILED|TERMINAL" "terminal failure cannot be reclaimed"

psql_q "select agent.complete_tool_invocation_internal('$INV_ORDINARY','SUCCEEDED','$HASH_OUT',null,null);" >/dev/null
ordinary_status="$(psql_q "select status from agent.agent_tool_invocations where id='$INV_ORDINARY'")"
assert_eq "$ordinary_status" "SUCCEEDED" "ordinary non-compensation completion remains unchanged"

expect_fail "terminal evidence cannot be deleted" "cannot be deleted" \
  "delete from agent.agent_tool_invocations where id='$INV_SUCCESS';"

printf '\nNative compensation crash/reclaim adversarial database matrix passed.\n'

#!/usr/bin/env bash
set -euo pipefail

# Destructive SQL fixture. Use only a deliberately created disposable database.
case "${PGHOST:-}" in
  127.0.0.1|localhost|::1) ;;
  *) echo 'PGHOST must identify a local PostgreSQL fixture endpoint.' >&2; exit 2 ;;
esac
: "${DATANEXUS_DISPOSABLE_FIXTURE_CONFIRM:?Set DATANEXUS_DISPOSABLE_FIXTURE_CONFIRM=I_ACCEPT_DESTRUCTIVE_FIXTURE only for a disposable database}"
if [[ "$DATANEXUS_DISPOSABLE_FIXTURE_CONFIRM" != 'I_ACCEPT_DESTRUCTIVE_FIXTURE' ]]; then
  echo 'DATANEXUS_DISPOSABLE_FIXTURE_CONFIRM must explicitly acknowledge destructive fixture SQL.' >&2
  exit 2
fi
case "${PGDATABASE:-}" in
  datanexus_fixture_*) ;;
  *) echo 'PGDATABASE must use the dedicated datanexus_fixture_ prefix.' >&2; exit 2 ;;
esac
: "${PGUSER:?PGUSER must identify the fixture administrator}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture_output="$(mktemp -d)"
trap 'rm -rf "$fixture_output"' EXIT

psql -X -v ON_ERROR_STOP=1 -f "$repo_root/scripts/test-learning-experiment-budget.sql"

# Ten independent sessions compete for five slots. Each must go through the
# production RPC as service_role. Successful reservations are left outstanding.
pids=()
for index in $(seq 1 10); do
  suffix="$(printf '%012d' "$index")"
  psql -X -v ON_ERROR_STOP=1 -At > "$fixture_output/$index" <<SQL &
set role service_role;
select agent.reserve_learning_experiment_budget(
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000009',
  '30000000-0000-4000-8000-000000000009',
  '50000000-0000-4000-8000-$suffix',
  '60000000-0000-4000-8000-$suffix',
  'profiling_agent','GUIDED',20,0.2,
  'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001'
)->>'reason';
SQL
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

admitted="$(awk '/^ADMITTED$/ { count++ } END { print count+0 }' "$fixture_output"/*)"
denied="$(awk '/^TOTAL_BUDGET_EXCEEDED$/ { count++ } END { print count+0 }' "$fixture_output"/*)"
if [[ "$admitted" != 5 || "$denied" != 5 ]]; then
  cat "$fixture_output"/* >&2
  echo "Expected exactly five admissions and five total-budget denials; got $admitted/$denied." >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if (select count(*) from agent.learning_experiment_budget_reservations where policy_id='30000000-0000-4000-8000-000000000009') <> 5
    or (select sum(reserved_tokens) from agent.learning_experiment_budget_reservations where policy_id='30000000-0000-4000-8000-000000000009') <> 100
    or (select sum(reserved_cost) from agent.learning_experiment_budget_reservations where policy_id='30000000-0000-4000-8000-000000000009') <> 1 then
    raise exception 'Concurrent sessions oversubscribed the locked experiment budget';
  end if;
end $$;
SQL
printf 'Learning experiment budget SQL and 10-session concurrency fixture passed.\n'

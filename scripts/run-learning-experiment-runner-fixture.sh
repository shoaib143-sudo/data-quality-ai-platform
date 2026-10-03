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
psql -X -v ON_ERROR_STOP=1 -f "$repo_root/scripts/test-learning-experiment-runner.sql"

# Independent sessions share one run/case/arm identity. Exactly one may acquire.
pids=()
for index in $(seq 1 10); do
  psql -X -v ON_ERROR_STOP=1 -At > "$fixture_output/$index" <<'SQL' &
set role service_role;
select agent.claim_learning_experiment_dispatch(
jsonb_build_object('projectId','10000000-0000-4000-8000-000000000001','policyId','30000000-0000-4000-8000-000000000099','candidateId','20000000-0000-4000-8000-000000000099','runId','50000000-0000-4000-8000-000000000100','caseKey',repeat('a',64),'datasetVersionId','version-99','arm','baseline','attempt',1,'artifactHash','sha256:'||repeat('c',64),'executionManifestHash','sha256:'||repeat('e',64)),
'sha256:'||repeat('d',64))->>'status';
SQL
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
acquired="$(awk '/^acquired$/ { count++ } END { print count+0 }' "$fixture_output"/*)"
ambiguous="$(awk '/^ambiguous$/ { count++ } END { print count+0 }' "$fixture_output"/*)"
if [[ "$acquired" != 1 || "$ambiguous" != 9 ]]; then
  cat "$fixture_output"/* >&2
  echo "Expected one acquired and nine ambiguous dispatches; got $acquired/$ambiguous." >&2
  exit 1
fi
printf 'Learning runner SQL and 10-session dispatch concurrency fixture passed.\n'

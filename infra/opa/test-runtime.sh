#!/usr/bin/env bash
set -euo pipefail

export PORT=18181
export OPA_AUTH_TOKEN=opa-runtime-contract-test-token
log_file="$(mktemp)"

bash infra/opa/render-start.sh >"$log_file" 2>&1 &
opa_pid=$!
trap 'kill "$opa_pid" 2>/dev/null || true; wait "$opa_pid" 2>/dev/null || true; rm -f "$log_file"' EXIT

for _ in $(seq 1 40); do
  if curl --fail --silent "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  if ! kill -0 "$opa_pid" 2>/dev/null; then
    cat "$log_file" >&2
    exit 1
  fi
  sleep 0.25
done
curl --fail --silent "http://127.0.0.1:${PORT}/health" >/dev/null

payload='{"input":{"request":{"project_id":"project-1","action_key":"CREATE_GOVERNANCE_ISSUE","target_type":"DATASET","risk_level":"LOW","confidence":0.95},"canonical":{"decision":"ALLOW","policy_id":"policy-1","policy_version_id":"version-7","authority_status":"APPROVED","execution_mode":"AUTO","reversible":true}}}'

unauthorized_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'content-type: application/json' \
  --data "$payload" \
  "http://127.0.0.1:${PORT}/v1/data/datanexus/autonomy/decision")"
if [[ "$unauthorized_status" == "200" ]]; then
  echo "OPA decision endpoint accepted an unauthenticated request" >&2
  exit 1
fi

response="$(curl --fail --silent \
  --header 'content-type: application/json' \
  --header "authorization: Bearer ${OPA_AUTH_TOKEN}" \
  --data "$payload" \
  "http://127.0.0.1:${PORT}/v1/data/datanexus/autonomy/decision")"

node -e '
const result = JSON.parse(process.argv[1]).result;
if (!result || result.decision !== "ALLOW" || result.policy_version_id !== "version-7") process.exit(1);
' "$response"

echo "OPA runtime health, bearer authentication, and governed decision endpoint verified."

#!/usr/bin/env bash
set -euo pipefail

export PORT=14318
export OTLP_COLLECTOR_PORT=14320
export OTLP_TEST_AUTH_PORT=14319
export OTLP_TEST_AUTHORIZATION='Bearer otel-runtime-contract-test-token'
export OTLP_AUTH_VERIFY_URL="http://127.0.0.1:${OTLP_TEST_AUTH_PORT}/verify"
log_file="$(mktemp)"
verifier_log="$(mktemp)"

node infra/otel/test-auth-verifier.mjs >"$verifier_log" 2>&1 &
verifier_pid=$!
bash infra/otel/render-start.sh >"$log_file" 2>&1 &
otel_pid=$!
trap 'kill "$otel_pid" "$verifier_pid" 2>/dev/null || true; wait "$otel_pid" "$verifier_pid" 2>/dev/null || true; rm -f "$log_file" "$verifier_log"' EXIT

for _ in $(seq 1 60); do
  if curl --fail --silent "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  if ! kill -0 "$otel_pid" 2>/dev/null; then
    cat "$log_file" >&2
    cat "$verifier_log" >&2
    exit 1
  fi
  sleep 0.25
done
curl --fail --silent "http://127.0.0.1:${PORT}/health" >/dev/null

payload='{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"datanexus-ci"}}]},"scopeSpans":[{"scope":{"name":"datanexus.runtime.contract"},"spans":[{"traceId":"0123456789abcdef0123456789abcdef","spanId":"0123456789abcdef","name":"collector-contract-test","kind":1,"startTimeUnixNano":"1789081200000000000","endTimeUnixNano":"1789081200001000000"}]}]}]}'

unauthorized_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'content-type: application/json' \
  --data "$payload" \
  "http://127.0.0.1:${PORT}/v1/traces")"
if [[ "$unauthorized_status" != "401" ]]; then
  echo "OTLP proxy did not reject missing authentication with HTTP 401; got ${unauthorized_status}" >&2
  exit 1
fi

wrong_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'content-type: application/json' \
  --header 'authorization: Bearer wrong-runtime-token' \
  --data "$payload" \
  "http://127.0.0.1:${PORT}/v1/traces")"
if [[ "$wrong_status" != "401" ]]; then
  echo "OTLP proxy did not reject an invalid delegated credential with HTTP 401; got ${wrong_status}" >&2
  exit 1
fi

authorized_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'content-type: application/json' \
  --header "authorization: ${OTLP_TEST_AUTHORIZATION}" \
  --data "$payload" \
  "http://127.0.0.1:${PORT}/v1/traces")"
if [[ "$authorized_status" != "200" ]]; then
  echo "Delegated-auth OTLP trace returned HTTP ${authorized_status}" >&2
  cat "$log_file" >&2
  cat "$verifier_log" >&2
  exit 1
fi

# The debug exporter intentionally stays at basic verbosity. Current Collector
# releases emit a one-line JSON summary such as \"spans\": 1; retain legacy
# patterns as compatibility guards without requiring detailed span payloads.
for _ in $(seq 1 20); do
  if grep -Eq '"spans"[[:space:]]*:[[:space:]]*1|Spans[[:space:]]*[:=][[:space:]]*1|Number of spans:[[:space:]]*1' "$log_file"; then
    echo "OTLP delegated bearer authentication and external debug sink verified."
    exit 0
  fi
  sleep 0.25
done

cat "$log_file" >&2
echo "Collector accepted the trace but did not emit receipt evidence to the debug sink" >&2
exit 1

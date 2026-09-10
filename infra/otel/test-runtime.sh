#!/usr/bin/env bash
set -euo pipefail

export PORT=14318
export OTEL_AUTH_TOKEN=otel-runtime-contract-test-token
log_file="$(mktemp)"

bash infra/otel/render-start.sh >"$log_file" 2>&1 &
otel_pid=$!
trap 'kill "$otel_pid" 2>/dev/null || true; wait "$otel_pid" 2>/dev/null || true; rm -f "$log_file"' EXIT

for _ in $(seq 1 40); do
  if curl --fail --silent "http://127.0.0.1:13133/" >/dev/null; then
    break
  fi
  if ! kill -0 "$otel_pid" 2>/dev/null; then
    cat "$log_file" >&2
    exit 1
  fi
  sleep 0.25
done
curl --fail --silent "http://127.0.0.1:13133/" >/dev/null

payload='{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"datanexus-ci"}}]},"scopeSpans":[{"scope":{"name":"datanexus.runtime.contract"},"spans":[{"traceId":"0123456789abcdef0123456789abcdef","spanId":"0123456789abcdef","name":"collector-contract-test","kind":1,"startTimeUnixNano":"1789081200000000000","endTimeUnixNano":"1789081200001000000"}]}]}]}'

unauthorized_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'content-type: application/json' \
  --data "$payload" \
  "http://127.0.0.1:${PORT}/v1/traces")"
if [[ "$unauthorized_status" == "200" ]]; then
  echo "OTLP receiver accepted an unauthenticated trace" >&2
  exit 1
fi

authorized_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'content-type: application/json' \
  --header "authorization: Bearer ${OTEL_AUTH_TOKEN}" \
  --data "$payload" \
  "http://127.0.0.1:${PORT}/v1/traces")"
if [[ "$authorized_status" != "200" ]]; then
  echo "Authenticated OTLP trace returned HTTP ${authorized_status}" >&2
  cat "$log_file" >&2
  exit 1
fi

for _ in $(seq 1 20); do
  if grep -Eq 'Spans[[:space:]]*[:=][[:space:]]*1|Number of spans:[[:space:]]*1' "$log_file"; then
    echo "OTLP runtime bearer authentication and external debug sink verified."
    exit 0
  fi
  sleep 0.25
done

cat "$log_file" >&2
echo "Collector accepted the trace but did not emit receipt evidence to the debug sink" >&2
exit 1

#!/usr/bin/env bash
set -euo pipefail

: "${PORT:?Render PORT is required}"
export OTLP_COLLECTOR_PORT="${OTLP_COLLECTOR_PORT:-4318}"
export OTLP_AUTH_VERIFY_URL="${OTLP_AUTH_VERIFY_URL:-https://data-quality-ai-platform.vercel.app/api/internal/observability/otlp-auth}"

test -x .render/otel/otelcol-contrib

.render/otel/otelcol-contrib --config=infra/otel/collector-config.yaml &
collector_pid=$!
node infra/otel/auth-proxy.mjs &
proxy_pid=$!

cleanup() {
  kill "$collector_pid" "$proxy_pid" 2>/dev/null || true
  wait "$collector_pid" "$proxy_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait -n "$collector_pid" "$proxy_pid"
status=$?
cleanup
trap - EXIT INT TERM
exit "$status"

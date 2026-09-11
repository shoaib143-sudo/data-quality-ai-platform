#!/usr/bin/env bash
set -euo pipefail

: "${PORT:?Render PORT is required}"
: "${OTEL_AUTH_TOKEN:?OTEL_AUTH_TOKEN is required}"

test -x .render/otel/otelcol-contrib
exec .render/otel/otelcol-contrib --config=infra/otel/collector-config.yaml

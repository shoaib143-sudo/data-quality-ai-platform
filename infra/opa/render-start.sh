#!/usr/bin/env bash
set -euo pipefail

: "${PORT:?Render PORT is required}"
: "${OPA_AUTH_TOKEN:?OPA_AUTH_TOKEN is required}"

test -x .render/opa/opa
test -s .render/opa/bundle.tar.gz

exec .render/opa/opa run \
  --server \
  --bundle .render/opa/bundle.tar.gz \
  --config-file infra/opa/opa-config.yaml \
  --authentication=token \
  --authorization=basic \
  --addr "0.0.0.0:${PORT}" \
  --skip-version-check

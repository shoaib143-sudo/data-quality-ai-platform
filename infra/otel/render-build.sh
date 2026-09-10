#!/usr/bin/env bash
set -euo pipefail

bash infra/otel/install-otelcol.sh
PORT=4318 OTEL_AUTH_TOKEN=build-validation-token \
  .render/otel/otelcol-contrib validate --config=infra/otel/collector-config.yaml

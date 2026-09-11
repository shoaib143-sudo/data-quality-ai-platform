#!/usr/bin/env bash
set -euo pipefail

bash infra/opa/install-opa.sh
opa_bin=".render/opa/opa"

"$opa_bin" fmt --fail infra/opa/policy
"$opa_bin" check --strict infra/opa/policy
"$opa_bin" test infra/opa/policy
"$opa_bin" build infra/opa/policy --output .render/opa/bundle.tar.gz

test -s .render/opa/bundle.tar.gz

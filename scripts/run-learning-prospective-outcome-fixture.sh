#!/usr/bin/env bash
set -euo pipefail

: "${DB_URL:?DB_URL must point to a disposable isolated PostgreSQL database}"
ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

case "$DB_URL" in
  *127.0.0.1*|*localhost*|*host.docker.internal*) : ;;
  *) echo 'Refusing to run the fixture against a non-local database.' >&2; exit 2 ;;
esac

psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -v fixture_guard=ISOLATED_PROSPECTIVE_OUTCOME_FIXTURE \
  -f "$ROOT/scripts/test-learning-prospective-outcome-fixture.sql"

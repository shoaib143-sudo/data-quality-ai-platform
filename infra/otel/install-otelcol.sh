#!/usr/bin/env bash
set -euo pipefail

OTELCOL_VERSION="${OTELCOL_VERSION:-0.160.0}"
if [[ "$OTELCOL_VERSION" != "0.160.0" ]]; then
  echo "OTELCOL_VERSION must remain pinned to 0.160.0" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64|amd64) arch="amd64" ;;
  aarch64|arm64) arch="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

install_dir=".render/otel"
mkdir -p "$install_dir"
archive="otelcol-contrib_${OTELCOL_VERSION}_linux_${arch}.tar.gz"
base_url="https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${OTELCOL_VERSION}/${archive}"

curl --fail --silent --show-error --location "$base_url" --output "$install_dir/$archive"
curl --fail --silent --show-error --location "${base_url}.sha256" --output "$install_dir/${archive}.sha256"
(
  cd "$install_dir"
  sha256sum --check "${archive}.sha256"
  tar --extract --gzip --file "$archive" otelcol-contrib
)
chmod 0755 "$install_dir/otelcol-contrib"
"$install_dir/otelcol-contrib" --version

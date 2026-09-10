#!/usr/bin/env bash
set -euo pipefail

OPA_VERSION="${OPA_VERSION:-v1.20.2}"
if [[ "$OPA_VERSION" != "v1.20.2" ]]; then
  echo "OPA_VERSION must remain pinned to v1.20.2" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64|amd64) artifact="opa_linux_amd64_static" ;;
  aarch64|arm64) artifact="opa_linux_arm64_static" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

install_dir=".render/opa"
mkdir -p "$install_dir"
base_url="https://openpolicyagent.org/downloads/${OPA_VERSION}/${artifact}"

curl --fail --silent --show-error --location "$base_url" --output "$install_dir/$artifact"
curl --fail --silent --show-error --location "${base_url}.sha256" --output "$install_dir/${artifact}.sha256"
(
  cd "$install_dir"
  expected_hash="$(awk '{print $1; exit}' "${artifact}.sha256")"
  if [[ ! "$expected_hash" =~ ^[0-9A-Fa-f]{64}$ ]]; then
    echo "Invalid upstream checksum for ${artifact}" >&2
    exit 1
  fi
  actual_hash="$(sha256sum "$artifact" | awk '{print $1}')"
  if [[ "${actual_hash,,}" != "${expected_hash,,}" ]]; then
    echo "Checksum mismatch for ${artifact}" >&2
    exit 1
  fi
)
mv "$install_dir/$artifact" "$install_dir/opa"
chmod 0755 "$install_dir/opa"
"$install_dir/opa" version

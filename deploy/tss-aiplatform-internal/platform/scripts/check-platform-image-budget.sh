#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-platform.sh
source "${script_dir}/lib-platform.sh"

node_config="${1:-}"
platform_config="${2:-}"
load_platform_config "$node_config" "$platform_config"
[[ $(id -u) -eq 0 ]] || die "image budget check must run as root"
require_control_plane_identity
require_space_gates
command -v docker >/dev/null || die "docker is required"

missing_bytes=0
while IFS='|' read -r _source_ref project_ref expected_id expected_size; do
  [[ -n $project_ref && $project_ref != \#* ]] || continue
  actual_id="$(docker image inspect --format '{{.Id}}' "$project_ref" 2>/dev/null || true)"
  if [[ -n $actual_id ]]; then
    [[ $actual_id == "$expected_id" ]] || die "existing project alias has an unexpected image ID: $project_ref"
  else
    missing_bytes=$((missing_bytes + expected_size))
  fi
done <"${script_dir}/../platform-images.lock"

root_free_bytes="$(df -PB1 / | awk 'NR==2 {print $4}')"
required_after_bytes=$((TSS_MIN_ROOT_FREE_GIB * 1024 * 1024 * 1024))
(( root_free_bytes - missing_bytes >= required_after_bytes )) \
  || die "locked image import would leave less than ${TSS_MIN_ROOT_FREE_GIB} GiB on the system root"
printf 'PASS: image budget leaves at least %s GiB on root; conservative missing-image budget=%s bytes\n' \
  "$TSS_MIN_ROOT_FREE_GIB" "$missing_bytes"

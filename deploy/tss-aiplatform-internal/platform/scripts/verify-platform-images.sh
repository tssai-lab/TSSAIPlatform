#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-platform.sh
source "${script_dir}/lib-platform.sh"

node_config="${1:-}"
platform_config="${2:-}"
load_platform_config "$node_config" "$platform_config"
command -v docker >/dev/null || die "docker is required"
lock_file="${script_dir}/../platform-images.lock"
[[ -f $lock_file ]] || die "platform image lock is missing"

count=0
while IFS='|' read -r _source_ref _source_digest project_ref expected_id budget_bytes; do
  [[ -n $_source_ref && $_source_ref != \#* ]] || continue
  actual_id="$(docker image inspect --format '{{.Id}}' "$project_ref" 2>/dev/null || true)"
  actual_size="$(docker image inspect --format '{{.Size}}' "$project_ref" 2>/dev/null || true)"
  actual_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$project_ref" 2>/dev/null || true)"
  [[ $actual_id == "$expected_id" ]] || die "platform image ID differs from lock: $project_ref"
  (( actual_size <= budget_bytes )) || die "platform image exceeds its conservative disk budget: $project_ref"
  [[ $actual_platform == linux/amd64 ]] || die "platform image is not linux/amd64: $project_ref"
  count=$((count + 1))
done <"$lock_file"
[[ $count -eq 4 ]] || die "expected four locked platform images"
echo "PASS: four project-specific application images match the immutable registry baseline"

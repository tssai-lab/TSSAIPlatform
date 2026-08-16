#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lock_file="${script_dir}/../platform-images.lock"
[[ $# -eq 0 ]] || { echo "ERROR: this command streams to stdout and accepts no output path" >&2; exit 1; }
command -v docker >/dev/null || { echo "ERROR: docker is required" >&2; exit 1; }
[[ -f $lock_file ]] || { echo "ERROR: image lock is missing" >&2; exit 1; }

declare -a temporary_tags=()
cleanup() {
  local tag
  for tag in "${temporary_tags[@]}"; do
    docker image rm "$tag" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

declare -a project_refs=()
while IFS='|' read -r source_ref project_ref expected_id expected_size; do
  [[ -n $source_ref && $source_ref != \#* ]] || continue
  [[ $project_ref == tss-aiplatform-internal/* && $project_ref != *:latest ]] \
    || { echo "ERROR: unsafe project image alias: $project_ref" >&2; exit 1; }
  actual_id="$(docker image inspect --format '{{.Id}}' "$source_ref" 2>/dev/null || true)"
  actual_size="$(docker image inspect --format '{{.Size}}' "$source_ref" 2>/dev/null || true)"
  [[ $actual_id == "$expected_id" && $actual_size == "$expected_size" ]] \
    || { echo "ERROR: source image differs from lock: $source_ref" >&2; exit 1; }
  if docker image inspect "$project_ref" >/dev/null 2>&1; then
    echo "ERROR: temporary project alias already exists on source host: $project_ref" >&2
    exit 1
  fi
  docker tag "$source_ref" "$project_ref"
  temporary_tags+=("$project_ref")
  project_refs+=("$project_ref")
done <"$lock_file"
[[ ${#project_refs[@]} -eq 4 ]] || { echo "ERROR: expected four platform images" >&2; exit 1; }

echo "PASS: exporting four locked application images; temporary source tags will be removed" >&2
docker save "${project_refs[@]}"

#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lock_file="${script_dir}/../frontend-image.lock"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

mode=${1:-}
[[ $mode == --validate-only || ( -n $mode && $mode == /* ) ]] \
  || die "usage: $0 --validate-only|/absolute/output/directory"
[[ -f $lock_file && ! -L $lock_file ]] || die "frontend image lock is absent or symbolic"
mapfile -t lock_lines < <(grep -Ev '^(#|$)' "$lock_file")
[[ ${#lock_lines[@]} -eq 1 ]] || die "frontend image lock must contain exactly one image"
IFS='|' read -r source_ref manifest_digest runtime_ref image_id fingerprint budget_bytes extra \
  <<<"${lock_lines[0]}"
[[ -z ${extra:-} ]] || die "frontend image lock has unexpected fields"
[[ $source_ref =~ ^ghcr\.io/tssai-lab/tssai-frontend:([0-9a-f]{40})$ ]] \
  || die "frontend source must use a full frontend commit tag"
source_sha=${BASH_REMATCH[1]}
[[ $manifest_digest =~ ^sha256:[0-9a-f]{64}$ \
  && $image_id =~ ^sha256:[0-9a-f]{64}$ \
  && $fingerprint =~ ^[0-9a-f]{64}$ \
  && $budget_bytes =~ ^[1-9][0-9]*$ ]] \
  || die "frontend image lock identity is invalid"
[[ $runtime_ref == docker.io/library/tss-aiplatform-frontend:"${source_sha:0:12}" ]] \
  || die "frontend runtime alias must derive from the source SHA"

if [[ $mode == --validate-only ]]; then
  echo "Frontend image export contract passed: source=${source_sha}"
  exit 0
fi
[[ ! -e $mode && ! -L $mode ]] || die "frontend export directory already exists"
for command_name in docker mkdir python3 sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is missing: $command_name"
done
mkdir -m 0700 -- "$mode"

immutable_ref="${source_ref}@${manifest_digest}"
docker pull --quiet --platform linux/amd64 "$immutable_ref" >/dev/null
actual_id=$(docker image inspect --format '{{.Id}}' "$immutable_ref")
actual_size=$(docker image inspect --format '{{.Size}}' "$immutable_ref")
actual_platform=$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$immutable_ref")
actual_revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$immutable_ref")
actual_fingerprint=$(docker image inspect "$immutable_ref" \
  | python3 "${script_dir}/image-runtime-fingerprint.py")
[[ $actual_id == "$image_id" && $actual_platform == linux/amd64 \
  && $actual_revision == "$source_sha" && $actual_fingerprint == "$fingerprint" ]] \
  || die "frontend registry image differs from the reviewed lock"
(( actual_size <= budget_bytes )) || die "frontend image exceeds its conservative disk budget"
docker tag "$immutable_ref" "$runtime_ref"
docker image save --output "${mode}/frontend-image-amd64.tar" "$runtime_ref"
cp -- "$lock_file" "${mode}/sources.lock"
(
  cd "$mode"
  sha256sum frontend-image-amd64.tar sources.lock >frontend-image.sha256
  sha256sum --check --strict frontend-image.sha256 >/dev/null
)
echo "Frontend image bundle exported: source=${source_sha} output=${mode}"

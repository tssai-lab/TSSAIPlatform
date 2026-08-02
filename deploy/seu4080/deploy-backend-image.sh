#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: deploy-backend-image.sh IMAGE EXPECTED_IMAGE_ID EXPECTED_DIGEST}"
expected_image_id="${2:?usage: deploy-backend-image.sh IMAGE EXPECTED_IMAGE_ID EXPECTED_DIGEST}"
expected_digest="${3:?usage: deploy-backend-image.sh IMAGE EXPECTED_IMAGE_ID EXPECTED_DIGEST}"
install_root="${TSS_INSTALL_ROOT:-/media/seu/data/tssai-platform}"
image_env="$install_root/images.env"
runtime_env="$install_root/.env"
compose_file="$install_root/compose.control.yml"
project="tss4080-control"

[[ "$image" =~ ^ghcr\.io/tssai-lab/tssai-backend:[0-9a-f]{40}$ ]] || {
  echo "refusing a non-immutable or unexpected backend image: $image" >&2
  exit 1
}
[[ "$expected_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "invalid expected image ID" >&2; exit 1; }
[[ "$expected_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "invalid expected digest" >&2; exit 1; }
[[ -f "$image_env" && -f "$runtime_env" && -f "$compose_file" ]] || {
  echo "seu4080 control stack is not bootstrapped" >&2
  exit 1
}

exec 9>"$install_root/.platform-deploy.lock"
flock -n 9 || { echo "another platform deployment is running" >&2; exit 1; }

actual_image_id="$(docker image inspect "$image" --format '{{.Id}}')"
[[ "$actual_image_id" == "$expected_image_id" ]] || { echo "local image ID does not match the workflow" >&2; exit 1; }
docker image inspect "$image" --format '{{range .RepoDigests}}{{println .}}{{end}}' \
  | grep --fixed-strings --quiet "@$expected_digest" \
  || { echo "local image digest does not match the workflow" >&2; exit 1; }

old_image="$(awk -F= '$1 == "TSS_BACKEND_IMAGE" {print substr($0, index($0, "=") + 1)}' "$image_env")"
[[ -n "$old_image" ]] || { echo "current backend image is missing" >&2; exit 1; }

backup_env="$(mktemp "$install_root/images.env.rollback.XXXXXX")"
next_env="$(mktemp "$install_root/images.env.next.XXXXXX")"
rollback_required=false
compose=()
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && "$rollback_required" == true ]]; then
    echo "backend deployment failed; rolling back to $old_image" >&2
    cp -p "$backup_env" "$image_env"
    if [[ "${#compose[@]}" -gt 0 ]]; then
      "${compose[@]}" up -d --no-deps backend || true
    fi
  fi
  rm -f "$backup_env" "$next_env"
  exit "$status"
}
trap cleanup EXIT
cp -p "$image_env" "$backup_env"
awk -v image="$image" '
  BEGIN { replaced = 0 }
  $1 == "TSS_BACKEND_IMAGE" { print "TSS_BACKEND_IMAGE=" image; replaced = 1; next }
  { print }
  END { if (!replaced) print "TSS_BACKEND_IMAGE=" image }
' "$image_env" >"$next_env"
chmod 600 "$next_env"
mv "$next_env" "$image_env"
rollback_required=true

compose=(docker compose --project-name "$project" --env-file "$runtime_env" --env-file "$image_env" -f "$compose_file")
"${compose[@]}" config --quiet
"${compose[@]}" up -d --no-deps backend

bind_ip="$(awk -F= '$1 == "TSS_BIND_IP" {print substr($0, index($0, "=") + 1)}' "$runtime_env")"
healthy=false
for _ in {1..90}; do
  if curl --fail --silent --show-error --max-time 3 "http://$bind_ip:18080/health/ready" >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  "${compose[@]}" logs --tail 120 backend >&2
  exit 1
fi

rollback_required=false
echo "deployed $image ($actual_image_id, $expected_digest)"
"${compose[@]}" ps backend

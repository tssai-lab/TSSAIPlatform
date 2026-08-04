#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: deploy-frontend-image.sh IMAGE EXPECTED_IMAGE_ID EXPECTED_DIGEST}"
expected_image_id="${2:?usage: deploy-frontend-image.sh IMAGE EXPECTED_IMAGE_ID EXPECTED_DIGEST}"
expected_digest="${3:?usage: deploy-frontend-image.sh IMAGE EXPECTED_IMAGE_ID EXPECTED_DIGEST}"
install_root="${TSS_INSTALL_ROOT:-/media/seu/data/tssai-platform}"
image_env="$install_root/images.env"
runtime_env="$install_root/.env"
base_compose="$install_root/compose.control.yml"
frontend_compose="$install_root/compose.frontend.yml"
rollback_state="$install_root/frontend-rollback.env"
project="tss4080-control"

[[ "$image" =~ ^ghcr\.io/tssai-lab/tssai-frontend:[0-9a-f]{40}$ ]] || {
  echo "refusing a non-immutable or unexpected frontend image: $image" >&2
  exit 1
}
[[ "$expected_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "invalid expected image ID" >&2; exit 1; }
[[ "$expected_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "invalid expected digest" >&2; exit 1; }
[[ -f "$image_env" && -f "$runtime_env" && -f "$base_compose" && -f "$frontend_compose" ]] || {
  echo "seu4080 frontend deployment assets are not installed" >&2
  exit 1
}

exec 9>"$install_root/.platform-deploy.lock"
flock -n 9 || { echo "another platform deployment is running" >&2; exit 1; }

actual_image_id="$(docker image inspect "$image" --format '{{.Id}}')"
[[ "$actual_image_id" == "$expected_image_id" ]] || { echo "local image ID does not match the workflow" >&2; exit 1; }
docker image inspect "$image" --format '{{range .RepoDigests}}{{println .}}{{end}}' \
  | grep --fixed-strings --quiet "@$expected_digest" \
  || { echo "local image digest does not match the workflow" >&2; exit 1; }

old_image="$(awk -F= '$1 == "TSS_FRONTEND_IMAGE" {print substr($0, index($0, "=") + 1)}' "$image_env")"
backup_env="$(mktemp "$install_root/images.env.rollback.XXXXXX")"
next_env="$(mktemp "$install_root/images.env.next.XXXXXX")"
next_rollback_state="$(mktemp "$install_root/frontend-rollback.next.XXXXXX")"
rollback_required=false
compose=()
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && "$rollback_required" == true ]]; then
    echo "frontend deployment failed; rolling back" >&2
    if [[ -z "$old_image" && "${#compose[@]}" -gt 0 ]]; then
      "${compose[@]}" rm -s -f frontend || true
    fi
    cp -p "$backup_env" "$image_env"
    if [[ -n "$old_image" && "${#compose[@]}" -gt 0 ]]; then
      "${compose[@]}" up -d --no-deps frontend || true
    fi
  fi
  rm -f "$backup_env" "$next_env" "$next_rollback_state"
  exit "$status"
}
trap cleanup EXIT
cp -p "$image_env" "$backup_env"
if [[ -n "$old_image" ]]; then
  printf 'TSS_FRONTEND_PRESENT=true\nTSS_FRONTEND_IMAGE=%s\n' "$old_image" >"$next_rollback_state"
else
  printf 'TSS_FRONTEND_PRESENT=false\nTSS_FRONTEND_IMAGE=\n' >"$next_rollback_state"
fi
chmod 600 "$next_rollback_state"
awk -v image="$image" '
  BEGIN { replaced = 0 }
  $1 == "TSS_FRONTEND_IMAGE" { print "TSS_FRONTEND_IMAGE=" image; replaced = 1; next }
  { print }
  END { if (!replaced) print "TSS_FRONTEND_IMAGE=" image }
' "$image_env" >"$next_env"
chmod 600 "$next_env"
mv "$next_env" "$image_env"
rollback_required=true

compose=(docker compose --project-name "$project" --env-file "$runtime_env" --env-file "$image_env" -f "$base_compose" -f "$frontend_compose")
"${compose[@]}" config --quiet
"${compose[@]}" up -d --no-deps frontend

bind_ip="$(awk -F= '$1 == "TSS_BIND_IP" {print substr($0, index($0, "=") + 1)}' "$runtime_env")"
healthy=false
for _ in {1..45}; do
  if curl --fail --silent --show-error --max-time 3 "http://$bind_ip/healthz" >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  "${compose[@]}" logs --tail 120 frontend >&2
  exit 1
fi

mv "$next_rollback_state" "$rollback_state"
rollback_required=false
echo "deployed $image ($actual_image_id, $expected_digest)"
"${compose[@]}" ps frontend

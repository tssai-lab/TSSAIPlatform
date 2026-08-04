#!/usr/bin/env bash
set -euo pipefail

install_root="${TSS_INSTALL_ROOT:-/media/seu/data/tssai-platform}"
image_env="$install_root/images.env"
runtime_env="$install_root/.env"
base_compose="$install_root/compose.control.yml"
frontend_compose="$install_root/compose.frontend.yml"
rollback_state="$install_root/frontend-rollback.env"
project="tss4080-control"

for file in "$image_env" "$runtime_env" "$base_compose" "$frontend_compose" "$rollback_state"; do
  [[ -f "$file" ]] || { echo "missing rollback prerequisite: $file" >&2; exit 1; }
done

previous_present="$(awk -F= '$1 == "TSS_FRONTEND_PRESENT" {print $2}' "$rollback_state")"
previous_image="$(awk -F= '$1 == "TSS_FRONTEND_IMAGE" {print substr($0, index($0, "=") + 1)}' "$rollback_state")"
[[ "$previous_present" == true || "$previous_present" == false ]] || {
  echo "invalid TSS_FRONTEND_PRESENT in rollback state" >&2
  exit 1
}
if [[ "$previous_present" == true ]]; then
  [[ "$previous_image" =~ ^ghcr\.io/tssai-lab/tssai-frontend:[0-9a-f]{40}$ ]] || {
    echo "invalid previous frontend image in rollback state" >&2
    exit 1
  }
  docker image inspect "$previous_image" >/dev/null
elif [[ -n "$previous_image" ]]; then
  echo "rollback state says frontend was absent but contains an image" >&2
  exit 1
fi

exec 9>"$install_root/.platform-deploy.lock"
flock -n 9 || { echo "another platform deployment is running" >&2; exit 1; }

current_image="$(awk -F= '$1 == "TSS_FRONTEND_IMAGE" {print substr($0, index($0, "=") + 1)}' "$image_env")"
[[ "$current_image" =~ ^ghcr\.io/tssai-lab/tssai-frontend:[0-9a-f]{40}$ ]] || {
  echo "current frontend image is missing or invalid" >&2
  exit 1
}

backup_env="$(mktemp "$install_root/images.env.rollback.XXXXXX")"
next_env="$(mktemp "$install_root/images.env.next.XXXXXX")"
next_rollback_state="$(mktemp "$install_root/frontend-rollback.next.XXXXXX")"
rollback_required=false
compose=(docker compose --project-name "$project" --env-file "$runtime_env" --env-file "$image_env" -f "$base_compose" -f "$frontend_compose")
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && "$rollback_required" == true ]]; then
    echo "rollback command failed; restoring current frontend $current_image" >&2
    cp -p "$backup_env" "$image_env"
    "${compose[@]}" up -d --no-deps frontend || true
  fi
  rm -f "$backup_env" "$next_env" "$next_rollback_state"
  exit "$status"
}
trap cleanup EXIT
cp -p "$image_env" "$backup_env"

if [[ "$previous_present" == true ]]; then
  awk -v image="$previous_image" '
    BEGIN { replaced = 0 }
    $1 == "TSS_FRONTEND_IMAGE" { print "TSS_FRONTEND_IMAGE=" image; replaced = 1; next }
    { print }
    END { if (!replaced) print "TSS_FRONTEND_IMAGE=" image }
  ' "$image_env" >"$next_env"
  chmod 600 "$next_env"
  mv "$next_env" "$image_env"
  rollback_required=true
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
  [[ "$healthy" == true ]] || {
    "${compose[@]}" logs --tail 120 frontend >&2
    exit 1
  }
else
  rollback_required=true
  "${compose[@]}" rm -s -f frontend
  [[ -z "$("${compose[@]}" ps -q frontend)" ]] || {
    echo "frontend container still exists after rollback" >&2
    exit 1
  }
  awk '$1 !~ /^TSS_FRONTEND_IMAGE=/' "$image_env" >"$next_env"
  chmod 600 "$next_env"
  mv "$next_env" "$image_env"
fi

printf 'TSS_FRONTEND_PRESENT=true\nTSS_FRONTEND_IMAGE=%s\n' "$current_image" >"$next_rollback_state"
chmod 600 "$next_rollback_state"
mv "$next_rollback_state" "$rollback_state"
rollback_required=false

if [[ "$previous_present" == true ]]; then
  echo "rolled frontend back to $previous_image"
  "${compose[@]}" ps frontend
else
  echo "rolled frontend back to the original absent state"
fi

#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

if [[ $# -ne 1 || ! -f $1 ]]; then
  echo "Usage: $0 /path/to/compose.backend.yml" >&2
  exit 1
fi

platform_dir="/opt/tss-platform"
compose_overlay="$1"
runtime_env="${platform_dir}/backend/.env.runtime"

command -v docker >/dev/null
command -v curl >/dev/null
command -v gzip >/dev/null
command -v openssl >/dev/null
command -v visudo >/dev/null
docker compose version >/dev/null
docker inspect tss-postgres >/dev/null
docker inspect tss-minio >/dev/null
docker image inspect tss-platform-mlflow:local >/dev/null
docker image inspect tss-training-worker:local >/dev/null
docker image inspect tss-inference-worker-main-cpu:local >/dev/null
id tss-deployer >/dev/null

for required_path in \
  "${platform_dir}/k8s/.kube/config" \
  "${platform_dir}/.tools/bin/kubectl" \
  "${platform_dir}/backend/scripts/k8s/verify-local-kind.sh"; do
  if [[ ! -e $required_path ]]; then
    echo "Required Main training runtime path is missing: $required_path" >&2
    exit 1
  fi
done

get_container_env() {
  local container="$1"
  local key="$2"

  docker inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | awk -v prefix="${key}=" 'index($0, prefix) == 1 { print substr($0, length(prefix) + 1); exit }'
}

postgres_db="$(get_container_env tss-postgres POSTGRES_DB)"
postgres_user="$(get_container_env tss-postgres POSTGRES_USER)"
postgres_password="$(get_container_env tss-postgres POSTGRES_PASSWORD)"
minio_user="$(get_container_env tss-minio MINIO_ROOT_USER)"
minio_password="$(get_container_env tss-minio MINIO_ROOT_PASSWORD)"

for value_name in postgres_db postgres_user postgres_password minio_user minio_password; do
  if [[ -z ${!value_name} ]]; then
    echo "Required runtime value ${value_name} is missing." >&2
    exit 1
  fi
done

install -d -m 700 "${platform_dir}/backend"
install -d -m 750 "${platform_dir}/backend/logs"
chown 10001:10001 "${platform_dir}/backend/logs"
install -m 600 "$compose_overlay" "${platform_dir}/compose.backend.yml"

umask 077
callback_token="$(
  awk -F= '$1 == "TRAINING_K8S_INTERNAL_CALLBACK_TOKEN" { print substr($0, index($0, "=") + 1); exit }' \
    "$runtime_env" 2>/dev/null || true
)"
if [[ -z $callback_token ]]; then
  callback_token="$(openssl rand -hex 32)"
fi

cat > "$runtime_env" <<EOF
SERVER_ADDRESS=127.0.0.1
SPRING_PROFILES_ACTIVE=default
SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5432/${postgres_db}
SPRING_DATASOURCE_USERNAME=${postgres_user}
SPRING_DATASOURCE_PASSWORD=${postgres_password}
MINIO_ENDPOINT=http://127.0.0.1:9010
MINIO_ACCESS_KEY=${minio_user}
MINIO_SECRET_KEY=${minio_password}
MINIO_BUCKET=models
TRAINING_MLFLOW_ENABLED=true
TRAINING_MLFLOW_TRACKING_URI=http://127.0.0.1:5000
TRAINING_MLFLOW_EXPERIMENT_NAME=tss-training
TRAINING_K8S_ENABLED=true
TRAINING_K8S_AUTO_CREATE=false
TRAINING_K8S_VERIFY_ON_STARTUP=true
TRAINING_K8S_FALLBACK_TO_LOCAL=false
TRAINING_K8S_PROJECT_ROOT=/opt/tss-platform
TRAINING_K8S_KUBECONFIG=/opt/tss-platform/k8s/.kube/config
TRAINING_K8S_KUBECTL_PATH=/opt/tss-platform/.tools/bin/kubectl
TRAINING_K8S_VERIFY_SCRIPT=/opt/tss-platform/backend/scripts/k8s/verify-local-kind.sh
TRAINING_K8S_WORKER_IMAGE=tss-training-worker:local
TRAINING_K8S_WORKER_IMAGE_PULL_POLICY=IfNotPresent
TRAINING_K8S_BACKEND_SERVICE_URL=http://tss-backend:8080
TRAINING_K8S_MINIO_SERVICE_URL=http://tss-minio:9000
TRAINING_K8S_MLFLOW_SERVICE_URL=http://tss-mlflow:5000
TRAINING_K8S_INTERNAL_CALLBACK_TOKEN=${callback_token}
INFERENCE_KUBERNETES_WORKER_IMAGE=tss-inference-worker-main-cpu:local
INFERENCE_KUBERNETES_WORKER_IMAGE_PULL_POLICY=IfNotPresent
EOF
chmod 600 "$runtime_env"

cat > /usr/local/sbin/tss-main-activate-backend <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 ghcr.io/tssai-lab/tssai-backend:<commit-sha>" >&2
  exit 1
fi

platform_dir="/opt/tss-platform"
compose_base="${platform_dir}/compose.yml"
compose_overlay="${platform_dir}/compose.backend.yml"
health_url="http://127.0.0.1:8080/v3/api-docs"
image="$1"

if [[ ! $image =~ ^ghcr\.io/tssai-lab/tssai-backend:[0-9a-f]{40}$ ]]; then
  echo "Refusing an invalid backend image reference." >&2
  exit 1
fi

previous_image="$(docker inspect tss-backend --format '{{.Config.Image}}' 2>/dev/null || true)"
export TSS_BACKEND_IMAGE="$image"

docker compose -f "$compose_base" -f "$compose_overlay" up -d --no-deps mlflow
docker compose -f "$compose_base" -f "$compose_overlay" up -d --no-deps backend

for _ in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 5 "$health_url" >/dev/null; then
    echo "Backend deployment is healthy: $image"
    exit 0
  fi
  sleep 2
done

echo "New backend did not become healthy; restoring the previous state." >&2
echo "[backend logs before rollback]" >&2
docker logs --tail 200 tss-backend >&2 || true
if [[ -n $previous_image ]]; then
  export TSS_BACKEND_IMAGE="$previous_image"
  docker compose -f "$compose_base" -f "$compose_overlay" up -d --no-deps backend
else
  docker compose -f "$compose_base" -f "$compose_overlay" rm -sf backend || true
fi
exit 1
EOF
chmod 700 /usr/local/sbin/tss-main-activate-backend

cat > /usr/local/sbin/tss-main-load-backend <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 ghcr.io/tssai-lab/tssai-backend:<commit-sha> sha256:<image-id>" >&2
  exit 1
fi

image="$1"
expected_image_id="$2"
if [[ ! $image =~ ^ghcr\.io/tssai-lab/tssai-backend:[0-9a-f]{40}$ ]]; then
  echo "Refusing an invalid backend image reference." >&2
  exit 1
fi
if [[ ! $expected_image_id =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Refusing an invalid image identifier." >&2
  exit 1
fi

gzip -dc | docker load >/dev/null
actual_image_id="$(docker image inspect "$image" --format '{{.Id}}')"
if [[ $actual_image_id != "$expected_image_id" ]]; then
  echo "Loaded image identifier does not match the GitHub runner image." >&2
  exit 1
fi

exec /usr/local/sbin/tss-main-activate-backend "$image"
EOF
chmod 700 /usr/local/sbin/tss-main-load-backend

rm -f /usr/local/sbin/tss-main-login-ghcr /usr/local/sbin/tss-main-deploy-backend
docker logout ghcr.io >/dev/null 2>&1 || true

cat > /etc/sudoers.d/tss-main-backend-deployer <<'EOF'
tss-deployer ALL=(root) NOPASSWD: /usr/local/sbin/tss-main-load-backend *
EOF
chmod 440 /etc/sudoers.d/tss-main-backend-deployer
visudo -cf /etc/sudoers.d/tss-main-backend-deployer >/dev/null

TSS_BACKEND_IMAGE="ghcr.io/tssai-lab/tssai-backend:0000000000000000000000000000000000000000" \
  docker compose -f "${platform_dir}/compose.yml" -f "${platform_dir}/compose.backend.yml" config --quiet

echo "Main backend deployment bootstrap completed."

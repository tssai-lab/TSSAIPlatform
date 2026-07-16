#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

if [[ $# -ne 1 || ! -f $1 ]]; then
  echo "Usage: TSS_NODE_CONFIG=/path/to/node.env $0 /path/to/compose.backend.yml" >&2
  exit 1
fi

if [[ -n ${TSS_NODE_CONFIG:-} ]]; then
  if [[ ! -f $TSS_NODE_CONFIG ]]; then
    echo "Node configuration file does not exist: $TSS_NODE_CONFIG" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$TSS_NODE_CONFIG"
  set +a
fi

node_id="${TSS_NODE_ID:-node-01}"
platform_dir="${TSS_PLATFORM_DIR:-/opt/tss-platform}"
deploy_user="${TSS_DEPLOY_USER:-tss-deployer}"
compose_base="${TSS_COMPOSE_BASE:-${platform_dir}/compose.yml}"
compose_overlay="$1"
runtime_env="${platform_dir}/backend/.env.runtime"
backend_container="${TSS_BACKEND_CONTAINER:-tss-backend}"
postgres_container="${TSS_POSTGRES_CONTAINER:-tss-postgres}"
minio_container="${TSS_MINIO_CONTAINER:-tss-minio}"
backend_image_repository="${TSS_BACKEND_IMAGE_REPOSITORY:-ghcr.io/tssai-lab/tssai-backend}"
backend_health_url="${TSS_BACKEND_HEALTH_URL:-http://127.0.0.1:8080/health/ready}"
cluster_name="${TSS_CLUSTER_NAME:-tss-training-${node_id}}"
server_address="${TSS_SERVER_ADDRESS:-127.0.0.1}"
spring_profiles_active="${TSS_SPRING_PROFILES_ACTIVE:-default}"
datasource_host="${TSS_DATASOURCE_HOST:-127.0.0.1}"
datasource_port="${TSS_DATASOURCE_PORT:-5432}"
minio_endpoint="${TSS_MINIO_ENDPOINT:-http://127.0.0.1:9010}"
minio_bucket="${TSS_MINIO_BUCKET:-models}"
mlflow_tracking_uri="${TSS_MLFLOW_TRACKING_URI:-http://127.0.0.1:5000}"
training_experiment_name="${TSS_TRAINING_EXPERIMENT_NAME:-tss-training}"
k8s_backend_service_url="${TSS_K8S_BACKEND_SERVICE_URL:-http://tss-backend:8080}"
k8s_minio_service_url="${TSS_K8S_MINIO_SERVICE_URL:-http://tss-minio:9000}"
k8s_mlflow_service_url="${TSS_K8S_MLFLOW_SERVICE_URL:-http://tss-mlflow:5000}"
mlflow_image="${TSS_MLFLOW_IMAGE:-tss-platform-mlflow:local}"
training_worker_image="${TSS_TRAINING_WORKER_IMAGE:-tss-training-worker:local}"
inference_worker_image="${TSS_INFERENCE_WORKER_IMAGE:-tss-inference-worker-cpu:local}"

if [[ -f ${platform_dir}/runtime-images.env ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${platform_dir}/runtime-images.env"
  set +a
  mlflow_image="${TSS_MLFLOW_IMAGE:-$mlflow_image}"
  training_worker_image="${TSS_TRAINING_WORKER_IMAGE:-$training_worker_image}"
  inference_worker_image="${TSS_INFERENCE_WORKER_IMAGE:-$inference_worker_image}"
fi

for command_name in curl docker gzip openssl visudo; do
  command -v "$command_name" >/dev/null
done
docker compose version >/dev/null
docker inspect "$postgres_container" >/dev/null
docker inspect "$minio_container" >/dev/null
docker image inspect "$mlflow_image" >/dev/null
docker image inspect "$training_worker_image" >/dev/null
docker image inspect "$inference_worker_image" >/dev/null
id "$deploy_user" >/dev/null

for required_path in \
  "${platform_dir}/k8s/.kube/config" \
  "${platform_dir}/.tools/bin/kubectl" \
  "${platform_dir}/backend/scripts/k8s/verify-local-kind.sh"; do
  if [[ ! -e $required_path ]]; then
    echo "Required node training runtime path is missing: $required_path" >&2
    exit 1
  fi
done

get_container_env() {
  local container="$1"
  local key="$2"

  docker inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | awk -v prefix="${key}=" 'index($0, prefix) == 1 { print substr($0, length(prefix) + 1); exit }'
}

postgres_db="$(get_container_env "$postgres_container" POSTGRES_DB)"
postgres_user="$(get_container_env "$postgres_container" POSTGRES_USER)"
postgres_password="$(get_container_env "$postgres_container" POSTGRES_PASSWORD)"
minio_user="$(get_container_env "$minio_container" MINIO_ROOT_USER)"
minio_password="$(get_container_env "$minio_container" MINIO_ROOT_PASSWORD)"

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
TSS_NODE_ID=${node_id}
SERVER_ADDRESS=${server_address}
SPRING_PROFILES_ACTIVE=${spring_profiles_active}
SPRING_DATASOURCE_URL=jdbc:postgresql://${datasource_host}:${datasource_port}/${postgres_db}
SPRING_DATASOURCE_USERNAME=${postgres_user}
SPRING_DATASOURCE_PASSWORD=${postgres_password}
MINIO_ENDPOINT=${minio_endpoint}
MINIO_ACCESS_KEY=${minio_user}
MINIO_SECRET_KEY=${minio_password}
MINIO_BUCKET=${minio_bucket}
TRAINING_MLFLOW_ENABLED=true
TRAINING_MLFLOW_TRACKING_URI=${mlflow_tracking_uri}
TRAINING_MLFLOW_EXPERIMENT_NAME=${training_experiment_name}
TRAINING_K8S_ENABLED=true
TRAINING_K8S_AUTO_CREATE=false
TRAINING_K8S_VERIFY_ON_STARTUP=true
TRAINING_K8S_FALLBACK_TO_LOCAL=false
TRAINING_K8S_CLUSTER_NAME=${cluster_name}
TRAINING_K8S_PROJECT_ROOT=/opt/tss-platform
TRAINING_K8S_KUBECONFIG=/opt/tss-platform/k8s/.kube/config
TRAINING_K8S_KUBECTL_PATH=/opt/tss-platform/.tools/bin/kubectl
TRAINING_K8S_VERIFY_SCRIPT=/opt/tss-platform/backend/scripts/k8s/verify-local-kind.sh
TRAINING_K8S_WORKER_IMAGE=${training_worker_image}
TRAINING_K8S_WORKER_IMAGE_PULL_POLICY=IfNotPresent
TRAINING_K8S_BACKEND_SERVICE_URL=${k8s_backend_service_url}
TRAINING_K8S_MINIO_SERVICE_URL=${k8s_minio_service_url}
TRAINING_K8S_MLFLOW_SERVICE_URL=${k8s_mlflow_service_url}
TRAINING_K8S_INTERNAL_CALLBACK_TOKEN=${callback_token}
INFERENCE_KUBERNETES_WORKER_IMAGE=${inference_worker_image}
INFERENCE_KUBERNETES_WORKER_IMAGE_PULL_POLICY=IfNotPresent
EOF
chmod 600 "$runtime_env"

install -d -m 700 /etc/tss-platform
{
  printf 'TSS_NODE_ID=%q\n' "$node_id"
  printf 'TSS_PLATFORM_DIR=%q\n' "$platform_dir"
  printf 'TSS_COMPOSE_BASE=%q\n' "$compose_base"
  printf 'TSS_COMPOSE_OVERLAY=%q\n' "${platform_dir}/compose.backend.yml"
  printf 'TSS_BACKEND_CONTAINER=%q\n' "$backend_container"
  printf 'TSS_BACKEND_IMAGE_REPOSITORY=%q\n' "$backend_image_repository"
  printf 'TSS_BACKEND_HEALTH_URL=%q\n' "$backend_health_url"
  printf 'TSS_MLFLOW_IMAGE=%q\n' "$mlflow_image"
} > /etc/tss-platform/node-runtime.env
chmod 600 /etc/tss-platform/node-runtime.env

cat > /usr/local/sbin/tss-node-activate-backend <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

source /etc/tss-platform/node-runtime.env

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <repository>:<40-character-commit-sha>" >&2
  exit 1
fi

image="$1"
prefix="${TSS_BACKEND_IMAGE_REPOSITORY}:"
if [[ $image != "${prefix}"* ]]; then
  echo "Refusing an image outside the configured repository." >&2
  exit 1
fi
tag="${image#${prefix}}"
if [[ ! $tag =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing a backend image without an immutable Git SHA tag." >&2
  exit 1
fi

previous_image="$(docker inspect "$TSS_BACKEND_CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || true)"
export TSS_BACKEND_IMAGE="$image"
export TSS_MLFLOW_IMAGE

docker compose -f "$TSS_COMPOSE_BASE" -f "$TSS_COMPOSE_OVERLAY" up -d --no-deps mlflow
docker compose -f "$TSS_COMPOSE_BASE" -f "$TSS_COMPOSE_OVERLAY" up -d --no-deps backend

for _ in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 5 "$TSS_BACKEND_HEALTH_URL" >/dev/null; then
    echo "Backend deployment is healthy: node=$TSS_NODE_ID image=$image"
    exit 0
  fi
  sleep 2
done

echo "New backend did not become ready; restoring the previous image." >&2
echo "[backend logs before rollback]" >&2
docker logs --tail 200 "$TSS_BACKEND_CONTAINER" >&2 || true
if [[ -n $previous_image ]]; then
  export TSS_BACKEND_IMAGE="$previous_image"
  docker compose -f "$TSS_COMPOSE_BASE" -f "$TSS_COMPOSE_OVERLAY" up -d --no-deps backend
else
  docker compose -f "$TSS_COMPOSE_BASE" -f "$TSS_COMPOSE_OVERLAY" rm -sf backend || true
fi
exit 1
EOF
chmod 700 /usr/local/sbin/tss-node-activate-backend

cat > /usr/local/sbin/tss-node-load-backend <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

source /etc/tss-platform/node-runtime.env

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <repository>:<commit-sha> sha256:<image-id>" >&2
  exit 1
fi

image="$1"
expected_image_id="$2"
prefix="${TSS_BACKEND_IMAGE_REPOSITORY}:"
if [[ $image != "${prefix}"* ]]; then
  echo "Refusing an invalid backend image reference." >&2
  exit 1
fi
tag="${image#${prefix}}"
if [[ ! $tag =~ ^[0-9a-f]{40}$ ]]; then
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
  echo "Loaded image identifier does not match the runner image." >&2
  exit 1
fi

exec /usr/local/sbin/tss-node-activate-backend "$image"
EOF
chmod 700 /usr/local/sbin/tss-node-load-backend

if [[ ${TSS_REMOVE_LEGACY_HELPERS:-false} == true ]]; then
  rm -f \
    /usr/local/sbin/tss-main-login-ghcr \
    /usr/local/sbin/tss-main-deploy-backend \
    /usr/local/sbin/tss-main-load-backend \
    /usr/local/sbin/tss-main-activate-backend \
    /etc/sudoers.d/tss-main-backend-deployer
fi

cat > /etc/sudoers.d/tss-node-backend-deployer <<EOF
${deploy_user} ALL=(root) NOPASSWD: /usr/local/sbin/tss-node-load-backend *
EOF
chmod 440 /etc/sudoers.d/tss-node-backend-deployer
visudo -cf /etc/sudoers.d/tss-node-backend-deployer >/dev/null

TSS_BACKEND_IMAGE="${backend_image_repository}:0000000000000000000000000000000000000000" \
TSS_MLFLOW_IMAGE="$mlflow_image" \
  docker compose -f "$compose_base" -f "${platform_dir}/compose.backend.yml" config --quiet

echo "Node backend deployment bootstrap completed: $node_id"

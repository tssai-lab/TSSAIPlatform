#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

if [[ $# -ne 1 || ! -d $1 ]]; then
  echo "Usage: $0 /path/to/TSSAIPlatform" >&2
  exit 1
fi

source_root="$(cd "$1" && pwd)"
platform_dir="/opt/tss-platform"
compose_base="${platform_dir}/compose.yml"
compose_overlay="${platform_dir}/compose.backend.yml"
kind_bin="${platform_dir}/.tools/bin/kind"
kubectl_bin="${platform_dir}/.tools/bin/kubectl"
cluster_name="tss-training"

command -v docker >/dev/null
command -v curl >/dev/null
command -v nginx >/dev/null
command -v sha256sum >/dev/null
command -v systemctl >/dev/null
docker compose version >/dev/null

install -d -m 755 "${platform_dir}/.tools/bin"

install_tool() {
  local target="$1"
  local url="$2"
  local expected_sha256="$3"
  local temporary

  if [[ -x $target ]] \
    && echo "${expected_sha256}  ${target}" | sha256sum --check --status; then
    return
  fi

  temporary="$(mktemp)"
  curl --fail --location --retry 3 --output "$temporary" "$url"
  echo "${expected_sha256}  ${temporary}" | sha256sum --check --status
  install -m 755 "$temporary" "$target"
  rm -f "$temporary"
}

install_tool \
  "$kind_bin" \
  "https://kind.sigs.k8s.io/dl/v0.32.0/kind-linux-amd64" \
  "50030de23cf40a18505f20426f6a8506bedf13c6e509244bd1fa9463721b0f54"
install_tool \
  "$kubectl_bin" \
  "https://dl.k8s.io/release/v1.34.8/bin/linux/amd64/kubectl" \
  "f6249132865c13abe3c9dd5038f5da65849cb86eee1608c001831504e481aa8c"

for required_path in \
  "$compose_base" \
  "$source_root/k8s/kind/cluster.yaml" \
  "$source_root/k8s/local/host-services.template.yaml" \
  "$source_root/backend/scripts/k8s/bootstrap-local-kind.sh" \
  "$source_root/backend/scripts/k8s/verify-local-kind.sh" \
  "$source_root/deploy/main/compose.backend.yml" \
  "$source_root/deploy/main/mlflow-lite/Dockerfile" \
  "$source_root/deploy/main/mlflow-lite/app.py"; do
  if [[ ! -e $required_path ]]; then
    echo "Required path is missing: $required_path" >&2
    exit 1
  fi
done

install -d -m 755 \
  "${platform_dir}/k8s" \
  "${platform_dir}/backend/scripts/k8s" \
  "${platform_dir}/mlflow-lite" \
  "${platform_dir}/mlflow-data"
chown 10001:10001 "${platform_dir}/mlflow-data"
cp -a "$source_root/k8s/." "${platform_dir}/k8s/"
install -m 755 \
  "$source_root/backend/scripts/k8s/bootstrap-local-kind.sh" \
  "${platform_dir}/backend/scripts/k8s/bootstrap-local-kind.sh"
install -m 755 \
  "$source_root/backend/scripts/k8s/verify-local-kind.sh" \
  "${platform_dir}/backend/scripts/k8s/verify-local-kind.sh"
install -m 644 \
  "$source_root/deploy/main/mlflow-lite/Dockerfile" \
  "${platform_dir}/mlflow-lite/Dockerfile"
install -m 644 \
  "$source_root/deploy/main/mlflow-lite/app.py" \
  "${platform_dir}/mlflow-lite/app.py"
install -m 600 \
  "$source_root/deploy/main/compose.backend.yml" \
  "$compose_overlay"

docker build \
  --build-arg PYTHON_BASE_IMAGE=docker.m.daocloud.io/library/python:3.11-slim \
  -t tss-platform-mlflow:local \
  "${platform_dir}/mlflow-lite"
docker build \
  --build-arg PYTHON_BASE_IMAGE=docker.m.daocloud.io/library/python:3.11-slim \
  -t tss-training-worker:local \
  "${platform_dir}/k8s/training-worker"
docker build \
  --build-arg INFERENCE_BASE_IMAGE=tss-training-worker:local \
  -t tss-inference-worker-main-cpu:local \
  "${platform_dir}/k8s/inference-worker"

current_image="$(docker inspect tss-backend --format '{{.Config.Image}}')"
export TSS_BACKEND_IMAGE="$current_image"
docker compose -f "$compose_base" -f "$compose_overlay" up -d --no-deps mlflow

SKIP_WORKER_BUILD=true \
BACKEND_HOST_PORT=18080 \
MINIO_HOST_PORT=9010 \
MLFLOW_HOST_PORT=15000 \
  bash "${platform_dir}/backend/scripts/k8s/bootstrap-local-kind.sh"

host_gateway="$(
  docker network inspect kind \
    --format '{{range .IPAM.Config}}{{if .Gateway}}{{.Gateway}}{{println}}{{end}}{{end}}' \
  | head -1 | tr -d '[:space:]'
)"
if [[ -z $host_gateway ]]; then
  echo "Unable to determine the kind network gateway." >&2
  exit 1
fi

cat > /etc/nginx/conf.d/tss-training-runtime.conf <<EOF
server {
    listen ${host_gateway}:18080;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}

server {
    listen ${host_gateway}:15000;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF
nginx -t
systemctl reload nginx

"$kind_bin" load docker-image tss-training-worker:local --name "$cluster_name"
"$kind_bin" load docker-image tss-inference-worker-main-cpu:local --name "$cluster_name"

chown root:10001 "${platform_dir}/k8s/.kube/config"
chmod 640 "${platform_dir}/k8s/.kube/config"

bash "${platform_dir}/backend/scripts/k8s/verify-local-kind.sh"

echo "Main training runtime bootstrap completed."
echo "Kind gateway: $host_gateway"

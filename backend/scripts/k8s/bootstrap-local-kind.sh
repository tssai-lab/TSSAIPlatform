#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TOOLS_DIR="${ROOT_DIR}/.tools/bin"
KIND="${KIND:-${TOOLS_DIR}/kind}"
KUBECTL="${KUBECTL:-${TOOLS_DIR}/kubectl}"
CLUSTER_NAME="${CLUSTER_NAME:-tss-training}"
KUBECONFIG_PATH="${KUBECONFIG_PATH:-${ROOT_DIR}/k8s/.kube/config}"

require_executable() {
  local executable="$1"
  if [[ ! -x "${executable}" ]]; then
    echo "Required executable not found: ${executable}" >&2
    exit 1
  fi
}

require_executable "${KIND}"
require_executable "${KUBECTL}"

mkdir -p "$(dirname "${KUBECONFIG_PATH}")"

if ! "${KIND}" get clusters | grep -Fxq "${CLUSTER_NAME}"; then
  "${KIND}" create cluster \
    --name "${CLUSTER_NAME}" \
    --config "${ROOT_DIR}/k8s/kind/cluster.yaml" \
    --kubeconfig "${KUBECONFIG_PATH}" \
    --wait 5m
else
  "${KIND}" export kubeconfig \
    --name "${CLUSTER_NAME}" \
    --kubeconfig "${KUBECONFIG_PATH}"
fi

export KUBECONFIG="${KUBECONFIG_PATH}"

"${KUBECTL}" wait --for=condition=Ready node --all --timeout=180s
"${KUBECTL}" apply -f "${ROOT_DIR}/k8s/base/training-namespace.yaml"
"${KUBECTL}" apply -f "${ROOT_DIR}/k8s/base/training-resource-policy.yaml"
"${KUBECTL}" apply -f "${ROOT_DIR}/k8s/base/training-service-account.yaml"

HOST_GATEWAY="$(
  docker network inspect kind \
    --format '{{range .IPAM.Config}}{{if .Gateway}}{{.Gateway}}{{println}}{{end}}{{end}}' \
  | head -1 | tr -d '[:space:]'
)"
if [[ -z "${HOST_GATEWAY}" ]]; then
  HOST_GATEWAY="$(docker network inspect kind --format '{{(index .IPAM.Config 1).Gateway}}' 2>/dev/null | tr -d '[:space:]')"
fi
if [[ -z "${HOST_GATEWAY}" ]]; then
  echo "Unable to determine Docker kind network gateway" >&2
  exit 1
fi

sed "s/__HOST_GATEWAY__/${HOST_GATEWAY}/g" \
  "${ROOT_DIR}/k8s/local/host-services.template.yaml" \
  | "${KUBECTL}" apply -f -

echo "Cluster: ${CLUSTER_NAME}"
echo "Kubeconfig: ${KUBECONFIG_PATH}"
echo "Host gateway: ${HOST_GATEWAY}"
"${KUBECTL}" get nodes -o wide
"${KUBECTL}" get resourcequota,limitrange,service -n tss-training

WORKER_BUILD_SCRIPT="${ROOT_DIR}/k8s/training-worker/build-and-load.sh"
if [[ -x "${WORKER_BUILD_SCRIPT}" ]]; then
  echo "构建并加载训练 Worker 镜像..."
  CLUSTER_NAME="${CLUSTER_NAME}" KIND="${KIND}" \
    TRAINING_WORKER_IMAGE="${TRAINING_WORKER_IMAGE:-tss-training-worker:local}" \
    bash "${WORKER_BUILD_SCRIPT}" || echo "WARN: 训练 Worker 镜像构建/加载失败，Job 可能 ImagePullBackOff"
fi

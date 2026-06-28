#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${TRAINING_WORKER_IMAGE:-tss-training-worker:local}"
CLUSTER_NAME="${CLUSTER_NAME:-tss-training}"
KIND="${KIND:-${ROOT_DIR}/.tools/bin/kind}"

echo "构建训练 Worker 镜像: ${IMAGE}"
docker build -t "${IMAGE}" "${ROOT_DIR}/k8s/training-worker"

if [[ -x "${KIND}" ]] && "${KIND}" get clusters 2>/dev/null | grep -Fxq "${CLUSTER_NAME}"; then
  echo "加载镜像到 kind 集群: ${CLUSTER_NAME}"
  "${KIND}" load docker-image "${IMAGE}" --name "${CLUSTER_NAME}"
else
  echo "kind 集群 ${CLUSTER_NAME} 不存在，跳过 load docker-image"
fi

echo "训练 Worker 镜像就绪: ${IMAGE}"

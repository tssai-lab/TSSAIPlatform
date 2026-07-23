#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${TRAINING_WORKER_IMAGE:-tss-training-worker:local}"
CLUSTER_NAME="${CLUSTER_NAME:-tss-training}"
KIND="${KIND:-${ROOT_DIR}/.tools/bin/kind}"
BASE_IMAGE="${TRAINING_WORKER_BASE_IMAGE:-python:3.11-slim}"
INSTALL_PYTORCH_CPU="${TRAINING_WORKER_INSTALL_PYTORCH_CPU:-true}"
LOAD_TO_KIND="${TRAINING_WORKER_LOAD_TO_KIND:-true}"

echo "构建训练 Worker 镜像: ${IMAGE}"
docker build \
  --build-arg "TRAINING_WORKER_BASE_IMAGE=${BASE_IMAGE}" \
  --build-arg "INSTALL_PYTORCH_CPU=${INSTALL_PYTORCH_CPU}" \
  -t "${IMAGE}" \
  "${ROOT_DIR}/k8s/training-worker"

if [[ "${LOAD_TO_KIND}" == "true" ]] \
  && [[ -x "${KIND}" ]] \
  && "${KIND}" get clusters 2>/dev/null | grep -Fxq "${CLUSTER_NAME}"; then
  echo "加载镜像到 kind 集群: ${CLUSTER_NAME}"
  "${KIND}" load docker-image "${IMAGE}" --name "${CLUSTER_NAME}"
else
  echo "跳过加载镜像到 kind；派生镜像将通过共享仓库分发"
fi

echo "训练 Worker 镜像就绪: ${IMAGE}"

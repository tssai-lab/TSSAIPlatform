#!/usr/bin/env bash
set -euo pipefail

PLATFORM_URL="${PLATFORM_URL:-http://127.0.0.1:8080}"
INFERENCE_URL="${INFERENCE_URL:-http://127.0.0.1:8081}"
MODEL_PT="${MODEL_PT:-}"
TEST_IMAGE="${TEST_IMAGE:-}"
TRAIN_TIMEOUT_SECONDS="${TRAIN_TIMEOUT_SECONDS:-300}"
POLL_SECONDS="${POLL_SECONDS:-2}"
KEEP_WORKDIR="${KEEP_WORKDIR:-false}"
RUN_INFERENCE="${RUN_INFERENCE:-false}"

WORKDIR="$(mktemp -d /tmp/tss-cpu-smoke-XXXXXX)"

cleanup() {
  if [[ "${KEEP_WORKDIR}" == "true" ]]; then
    echo "Work directory retained: ${WORKDIR}"
  else
    rm -rf "${WORKDIR}"
  fi
}
trap cleanup EXIT

json_get() {
  local json="$1"
  local path="$2"
  JSON_INPUT="${json}" JSON_PATH="${path}" python3 -c '
import json
import os
import sys

value = json.loads(os.environ["JSON_INPUT"])
for part in os.environ["JSON_PATH"].split("."):
    if part:
        value = value[part]
if value is None:
    print("")
elif isinstance(value, bool):
    print("true" if value else "false")
elif isinstance(value, (dict, list)):
    print(json.dumps(value, ensure_ascii=False))
else:
    print(value)
' || {
    echo "Failed to read JSON path '${path}' from response:" >&2
    echo "${json}" >&2
    return 1
  }
}

require_api_success() {
  local json="$1"
  local label="$2"
  local success
  success="$(json_get "${json}" "success")"
  if [[ "${success}" != "true" ]]; then
    echo "${label} failed:" >&2
    echo "${json}" >&2
    exit 1
  fi
}

require_result_success() {
  local json="$1"
  local label="$2"
  local code
  code="$(json_get "${json}" "code")"
  if [[ "${code}" != "200" ]]; then
    echo "${label} failed:" >&2
    echo "${json}" >&2
    exit 1
  fi
}

require_file() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    echo "Required file does not exist: ${file}" >&2
    exit 1
  fi
}

upload_chunks() {
  local upload_url="$1"
  local upload_id="$2"
  local file="$3"
  local part_dir="$4"

  mkdir -p "${part_dir}"
  split -b 5242880 -d -a 5 "${file}" "${part_dir}/part-"

  local part
  local index=0
  while IFS= read -r part; do
    local response
    response="$(curl -fsS -X POST \
      "${upload_url}?uploadId=${upload_id}&partIndex=${index}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -F "file=@${part}")"
    require_api_success "${response}" "Upload chunk ${index}"
    index=$((index + 1))
  done < <(find "${part_dir}" -maxdepth 1 -type f -name 'part-*' | sort)
}

echo "[1/7] Checking platform service"
curl -sS "${PLATFORM_URL}/api/user/current-user" >/dev/null
if [[ "${RUN_INFERENCE}" == "true" ]]; then
  curl -fsS "${INFERENCE_URL}/actuator/health" >/dev/null
fi

USERNAME="cpu$(date +%s)"
PASSWORD="CpuDemo_123"

echo "[2/7] Registering and logging in as ${USERNAME}"
REGISTER_RESPONSE="$(curl -fsS -X POST \
  "${PLATFORM_URL}/api/user/register/username" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\":\"${USERNAME}\",
    \"password\":\"${PASSWORD}\",
    \"confirmPassword\":\"${PASSWORD}\"
  }")"
require_result_success "${REGISTER_RESPONSE}" "Register user"

LOGIN_RESPONSE="$(curl -fsS -X POST \
  "${PLATFORM_URL}/api/user/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\":\"account\",
    \"username\":\"${USERNAME}\",
    \"password\":\"${PASSWORD}\"
  }")"
require_result_success "${LOGIN_RESPONSE}" "Login"

TOKEN="$(json_get "${LOGIN_RESPONSE}" "data.token")"
USER_ID="$(json_get "${LOGIN_RESPONSE}" "data.userId")"
if [[ -z "${TOKEN}" || -z "${USER_ID}" ]]; then
  echo "Login did not return token or userId" >&2
  exit 1
fi

echo "[3/7] Preparing model and YOLO dataset archives"
mkdir -p "${WORKDIR}/model" "${WORKDIR}/dataset/images" "${WORKDIR}/dataset/labels"
if [[ -n "${MODEL_PT}" ]]; then
  require_file "${MODEL_PT}"
  cp "${MODEL_PT}" "${WORKDIR}/model/model.pt"
else
  printf 'TSS local CPU training smoke model placeholder\n' >"${WORKDIR}/model/model.pt"
fi

if [[ -n "${TEST_IMAGE}" ]]; then
  require_file "${TEST_IMAGE}"
  cp "${TEST_IMAGE}" "${WORKDIR}/dataset/images/sample.jpg"
else
  printf '%s' \
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' \
    | base64 -d >"${WORKDIR}/dataset/images/sample.png"
fi
printf '0 0.5 0.5 0.5 0.5\n' >"${WORKDIR}/dataset/labels/sample.txt"

(
  cd "${WORKDIR}/model"
  jar cfM "${WORKDIR}/cpu-yolo-model.zip" model.pt
)
(
  cd "${WORKDIR}/dataset"
  jar cfM "${WORKDIR}/cpu-yolo-dataset.zip" images labels
)

MODEL_ZIP="${WORKDIR}/cpu-yolo-model.zip"
DATASET_ZIP="${WORKDIR}/cpu-yolo-dataset.zip"

echo "[4/7] Uploading model"
MODEL_SIZE="$(stat -c '%s' "${MODEL_ZIP}")"
MODEL_FINGERPRINT="$(sha256sum "${MODEL_ZIP}" | awk '{print $1}')"
MODEL_INIT="$(curl -fsS -X POST \
  "${PLATFORM_URL}/api/model/upload/init" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"fileName\":\"cpu-yolo-model.zip\",
    \"fileSize\":${MODEL_SIZE},
    \"fileFingerprint\":\"${MODEL_FINGERPRINT}\"
  }")"
require_api_success "${MODEL_INIT}" "Initialize model upload"
MODEL_UPLOAD_ID="$(json_get "${MODEL_INIT}" "data.uploadId")"

upload_chunks \
  "${PLATFORM_URL}/api/model/upload/chunk" \
  "${MODEL_UPLOAD_ID}" \
  "${MODEL_ZIP}" \
  "${WORKDIR}/model-parts"

MODEL_COMPLETE="$(curl -fsS -X POST \
  "${PLATFORM_URL}/api/model/upload/complete" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"uploadId\":\"${MODEL_UPLOAD_ID}\",
    \"modelName\":\"CPU YOLO Demo ${USERNAME}\",
    \"version\":\"v1\",
    \"type\":\"CV\",
    \"remark\":\"Local CPU closed-loop smoke test\"
  }")"
require_api_success "${MODEL_COMPLETE}" "Complete model upload"
MODEL_VERSION_ID="$(json_get "${MODEL_COMPLETE}" "data.id")"

echo "[5/7] Uploading dataset"
DATASET_SIZE="$(stat -c '%s' "${DATASET_ZIP}")"
DATASET_FINGERPRINT="$(sha256sum "${DATASET_ZIP}" | awk '{print $1}')"
DATASET_INIT="$(curl -fsS -X POST \
  "${PLATFORM_URL}/api/dataset/upload/init" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"fileName\":\"cpu-yolo-dataset.zip\",
    \"fileSize\":${DATASET_SIZE},
    \"fileFingerprint\":\"${DATASET_FINGERPRINT}\",
    \"datasetName\":\"CPU YOLO Dataset ${USERNAME}\",
    \"version\":\"v1\",
    \"versionLabel\":\"v1\",
    \"type\":\"CV\",
    \"cvTaskType\":\"OBJECT_DETECTION\",
    \"annotationFormat\":\"YOLO\",
    \"remark\":\"Local CPU closed-loop smoke test\"
  }")"
require_api_success "${DATASET_INIT}" "Initialize dataset upload"
DATASET_UPLOAD_ID="$(json_get "${DATASET_INIT}" "data.uploadId")"

upload_chunks \
  "${PLATFORM_URL}/api/dataset/upload/chunk" \
  "${DATASET_UPLOAD_ID}" \
  "${DATASET_ZIP}" \
  "${WORKDIR}/dataset-parts"

DATASET_COMPLETE="$(curl -fsS -X POST \
  "${PLATFORM_URL}/api/dataset/upload/complete" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"uploadId\":\"${DATASET_UPLOAD_ID}\"}")"
require_api_success "${DATASET_COMPLETE}" "Complete dataset upload"
DATASET_VERSION_ID="$(json_get "${DATASET_COMPLETE}" "data.datasetVersionId")"

echo "[6/7] Creating CPU training task"
TRAIN_CREATE="$(curl -fsS -X POST \
  "${PLATFORM_URL}/api/task/create" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"CPU Closed Loop ${USERNAME}\",
    \"modelVersionId\":\"${MODEL_VERSION_ID}\",
    \"codeVersionId\":\"cpu-demo-code-v1\",
    \"datasetVersionId\":\"${DATASET_VERSION_ID}\",
    \"hyperParams\":{\"epochs\":3,\"lr0\":0.05,\"device\":\"cpu\"},
    \"remark\":\"Local CPU closed-loop smoke test\"
  }")"
require_api_success "${TRAIN_CREATE}" "Create training task"

TRAINING_ID="$(json_get "${TRAIN_CREATE}" "data.id")"
EXPERIMENT_ID="$(json_get "${TRAIN_CREATE}" "data.experimentId")"
VERSION_NO="$(json_get "${TRAIN_CREATE}" "data.versionNo")"

echo "[7/7] Waiting for training result"
deadline=$((SECONDS + TRAIN_TIMEOUT_SECONDS))
TRAIN_STATUS=""
TRAIN_DETAIL=""
while (( SECONDS < deadline )); do
  TRAIN_DETAIL="$(curl -fsS \
    "${PLATFORM_URL}/api/task/detail?id=${TRAINING_ID}" \
    -H "Authorization: Bearer ${TOKEN}")"
  require_api_success "${TRAIN_DETAIL}" "Read training task"
  TRAIN_STATUS="$(json_get "${TRAIN_DETAIL}" "data.status")"
  TRAIN_PROGRESS="$(json_get "${TRAIN_DETAIL}" "data.progress")"
  echo "Training status=${TRAIN_STATUS}, progress=${TRAIN_PROGRESS}%"
  if [[ "${TRAIN_STATUS}" == "success" || "${TRAIN_STATUS}" == "failed" ]]; then
    break
  fi
  sleep "${POLL_SECONDS}"
done

if [[ "${TRAIN_STATUS}" != "success" ]]; then
  echo "Training did not succeed:" >&2
  echo "${TRAIN_DETAIL}" >&2
  exit 1
fi

TRAIN_OUTPUT="$(json_get "${TRAIN_DETAIL}" "data.outputPath")"
TRAIN_METRICS="$(json_get "${TRAIN_DETAIL}" "data.metrics")"

if [[ "${RUN_INFERENCE}" == "true" ]]; then
  echo "[optional] Binding experiment to built-in CPU runtime model"
  DEPLOY_RESPONSE="$(curl -fsS -X POST \
    "${INFERENCE_URL}/api/inference/deployments" \
    -H "X-User-Id: ${USER_ID}" \
    -H "Content-Type: application/json" \
    -d "{
      \"experimentId\":\"${EXPERIMENT_ID}\",
      \"versionNo\":${VERSION_NO},
      \"runtimeModelId\":\"yolov8n\",
      \"modality\":\"CV\",
      \"inferenceTask\":\"OBJECT_DETECTION\"
    }")"
  require_api_success "${DEPLOY_RESPONSE}" "Create inference deployment"
  DEPLOY_STATUS="$(json_get "${DEPLOY_RESPONSE}" "data.status")"
  if [[ "${DEPLOY_STATUS}" != "AVAILABLE" ]]; then
    echo "Deployment is not available:" >&2
    echo "${DEPLOY_RESPONSE}" >&2
    exit 1
  fi

  INFERENCE_INPUT="${TEST_IMAGE:-${WORKDIR}/dataset/images/sample.png}"
  echo "[optional] Uploading inference image and predicting"
  UPLOAD_RESPONSE="$(curl -fsS -X POST \
    "${INFERENCE_URL}/api/inference/test-files" \
    -H "X-User-Id: ${USER_ID}" \
    -F "file=@${INFERENCE_INPUT}")"
  require_api_success "${UPLOAD_RESPONSE}" "Upload inference image"
  INPUT_OBJECT="$(json_get "${UPLOAD_RESPONSE}" "data.objectName")"

  PREDICT_RESPONSE="$(curl -fsS -X POST \
    "${INFERENCE_URL}/api/inference/predict/cv" \
    -H "X-User-Id: ${USER_ID}" \
    -H "Content-Type: application/json" \
    -d "{
      \"sourceType\":\"TRAINING_OUTPUT\",
      \"experimentId\":\"${EXPERIMENT_ID}\",
      \"versionNo\":${VERSION_NO},
      \"inputObjectName\":\"${INPUT_OBJECT}\",
      \"params\":{\"confidence\":0.25,\"topK\":20}
    }")"
  require_api_success "${PREDICT_RESPONSE}" "Run CV inference"
  INFERENCE_RECORD_ID="$(json_get "${PREDICT_RESPONSE}" "data.recordId")"

  RECORDS_RESPONSE="$(curl -fsS \
    "${INFERENCE_URL}/api/inference/records" \
    -H "X-User-Id: ${USER_ID}")"
  require_api_success "${RECORDS_RESPONSE}" "Read inference records"
fi

echo
echo "========== CPU TRAINING LOOP PASSED =========="
echo "User ID: ${USER_ID}"
echo "Model version: ${MODEL_VERSION_ID}"
echo "Dataset version: ${DATASET_VERSION_ID}"
echo "Training ID: ${TRAINING_ID}"
echo "Training experiment: ${EXPERIMENT_ID}"
echo "Experiment version: ${VERSION_NO}"
echo "Training status: ${TRAIN_STATUS}"
echo "Training output: ${TRAIN_OUTPUT}"
echo "Training metrics: ${TRAIN_METRICS}"
if [[ "${RUN_INFERENCE}" == "true" ]]; then
  echo "Deployment status: ${DEPLOY_STATUS}"
  echo "Inference record: ${INFERENCE_RECORD_ID}"
  echo
  echo "IMPORTANT:"
  echo "The optional deployment is bound to the built-in runtime model 'yolov8n'."
  echo "The current inference service does not load the training output local-regressor.json."
fi

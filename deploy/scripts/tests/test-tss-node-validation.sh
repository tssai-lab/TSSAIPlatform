#!/usr/bin/env bash
set -Eeuo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
validator="${root_dir}/deploy/scripts/tss-node-validate-deployment"
bootstrap="${root_dir}/deploy/scripts/bootstrap-node-backend.sh"
backend_activator="${root_dir}/deploy/scripts/tss-node-activate-backend"
backend_loader="${root_dir}/deploy/scripts/tss-node-load-backend"
runtime_loader="${root_dir}/deploy/scripts/tss-node-load-inference"
runtime_workflow="${root_dir}/.github/workflows/runtime-images.yml"
cv_dockerfile="${root_dir}/k8s/training-worker/Dockerfile.cv"

workdir="$(mktemp -d)"
cleanup() {
  rm -rf "$workdir"
}
trap cleanup EXIT

runtime_file="${workdir}/node-runtime.env"
cat >"$runtime_file" <<'EOF'
TSS_BACKEND_IMAGE_REPOSITORY=ghcr.io/tssai-lab/tssai-backend
TSS_INFERENCE_IMAGE_REPOSITORY=ghcr.io/tssai-lab/tss-inference-worker-cpu
TSS_INFERENCE_FALLBACK_IMAGE_REPOSITORY=registry.example/tss-inference-worker-cpu
TSS_CV_IMAGE_REPOSITORY=registry.example/tss-cv-worker
TSS_NLP_IMAGE_REPOSITORY=registry.example/tss-nlp-worker
TSS_PLATFORM_DIR=/nonexistent/tss-platform
EOF

fail_case() {
  local expected_message="$1"
  shift
  if TSS_NODE_RUNTIME_ENV="$runtime_file" bash "$validator" "$@" >"${workdir}/output" 2>&1; then
    echo "Expected validator failure: $expected_message" >&2
    exit 1
  fi
  if ! grep -F "$expected_message" "${workdir}/output" >/dev/null; then
    cat "${workdir}/output" >&2
    exit 1
  fi
}

valid_backend="ghcr.io/tssai-lab/tssai-backend:$(printf 'a%.0s' {1..40})"
valid_id="sha256:$(printf 'b%.0s' {1..64})"
valid_cv="registry.example/tss-cv-worker:$(printf 'c%.0s' {1..40})"
valid_inference_fallback="registry.example/tss-inference-worker-cpu:$(printf 'd%.0s' {1..40})"

fail_case "Backend image must use" "ghcr.io/tssai-lab/tssai-backend:latest" "$valid_id"
fail_case "Backend image ID is invalid" "$valid_backend" "sha256:short"
fail_case "NLP image must use" "$valid_backend" "$valid_id" "$valid_cv" "registry.example/tss-nlp-worker:latest"

if TSS_NODE_RUNTIME_ENV="$runtime_file" bash "$runtime_loader" \
  "$valid_inference_fallback" "$valid_id" >"${workdir}/loader-output" 2>&1; then
  echo "Expected loader to stop at the intentionally absent platform directory." >&2
  exit 1
fi
grep -F "Backend runtime environment does not exist." "${workdir}/loader-output" >/dev/null

grep -F 'tss.ai/deployment-smoke: "true"' "$validator" >/dev/null
grep -F 'imagePullPolicy: ${pull_policy}' "$validator" >/dev/null
grep -F 'automountServiceAccountToken: false' "$validator" >/dev/null
grep -F 'trap cleanup EXIT' "$validator" >/dev/null
grep -F 'tss-node-activate-backend' "$bootstrap" >/dev/null
grep -F 'tss-node-load-backend' "$bootstrap" >/dev/null
grep -F 'tss-node-validate-deployment "$image" "$expected_image_id"' "$backend_activator" >/dev/null
grep -F 'tss-node-activate-backend "$image" "$expected_image_id"' "$backend_loader" >/dev/null
grep -F 'tss-node-validate-deployment "${validation_args[@]}"' "$runtime_loader" >/dev/null
grep -F 'Deploy and validate Main runtime images' "$runtime_workflow" >/dev/null
grep -F 'tss-node-load-inference' "$runtime_workflow" | grep -F '$cv_image' >/dev/null
grep -F 'crpi-s1uie3z8n3mbqf6y.cn-shanghai.personal.cr.aliyuncs.com/tss-platform/tss-inference-worker-cpu:${{ github.sha }}' "$runtime_workflow" >/dev/null
grep -F 'image="crpi-s1uie3z8n3mbqf6y.cn-shanghai.personal.cr.aliyuncs.com/tss-platform/tss-inference-worker-cpu:${GITHUB_SHA}"' "$runtime_workflow" >/dev/null
grep -F 'run_smoke_pod "inference" "$inference_image" "IfNotPresent"' "$validator" >/dev/null
grep -F 'images list --quiet' "$validator" >/dev/null
if grep -F 'Configured inference image is not ready in Kubernetes containerd.' "$validator" >/dev/null; then
  echo "Validator must allow an authenticated IfNotPresent pull after kubelet image GC." >&2
  exit 1
fi
requirements_install_line="$(grep -nF 'pip install --no-cache-dir -r requirements-cv.txt' "$cv_dockerfile" | cut -d: -f1)"
opencv_uninstall_line="$(grep -nF 'pip uninstall -y opencv-python opencv-contrib-python opencv-contrib-python-headless' "$cv_dockerfile" | cut -d: -f1)"
headless_reinstall_line="$(grep -nF 'pip install --no-cache-dir --force-reinstall --no-deps opencv-python-headless==4.10.0.84' "$cv_dockerfile" | cut -d: -f1)"
[[ "$requirements_install_line" -lt "$opencv_uninstall_line" ]]
[[ "$opencv_uninstall_line" -lt "$headless_reinstall_line" ]]

echo "Deployment validation contract tests passed."

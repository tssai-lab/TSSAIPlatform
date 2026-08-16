#!/usr/bin/env bash
set -Eeuo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
internal_dir="${root_dir}/deploy/tss-aiplatform-internal"
# shellcheck disable=SC1091
source "${internal_dir}/versions.env"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

uuid=11111111-2222-3333-4444-555555555555
# Keep explicit generated fixtures here as well as committed test fixtures: the
# generated copies exercise the exact values used by negative mutation tests.
cat >"${workdir}/control.env" <<EOF
TSS_CLUSTER_ID=tss-aiplatform-internal
TSS_NODE_NAME=tss-ai-control-01
TSS_NODE_ROLES=control-plane,platform,storage
TSS_NODE_IP=192.0.2.10
TSS_CONTROL_PLANE_ENDPOINT=192.0.2.10:6443
TSS_ADDRESS_STABILITY_CONFIRMED=true
TSS_CONTAINERD_CONFIG_VERSION=3
TSS_CONTAINERD_ROOT=/srv/tss-AIplatform/containerd
TSS_CONTAINERD_STATE_DIR=/run/tss-aiplatform/containerd
TSS_CONTAINERD_SOCKET=/run/tss-aiplatform/containerd/containerd.sock
TSS_ENABLE_NVIDIA_RUNTIME=false
TSS_STORAGE_MOUNT_POINT=/srv/tss-AIplatform
TSS_EXPECTED_STORAGE_UUID=${uuid}
TSS_PROJECT_ROOT=/srv/tss-AIplatform
TSS_KUBELET_ROOT=/srv/tss-AIplatform/kubelet
TSS_MIN_STORAGE_FREE_GIB=1024
TSS_MIN_ROOT_FREE_GIB=20
TSS_ETCD_DATA_DIR=/var/lib/tss-aiplatform/etcd
TSS_POD_CIDR=10.245.0.0/16
TSS_SERVICE_CIDR=10.97.0.0/16
EOF

cat >"${workdir}/worker.env" <<EOF
TSS_CLUSTER_ID=tss-aiplatform-internal
TSS_NODE_NAME=tss-ai-worker-01
TSS_NODE_ROLES=worker,cpu,gpu
TSS_NODE_IP=192.0.2.20
TSS_CONTROL_PLANE_ENDPOINT=192.0.2.10:6443
TSS_ADDRESS_STABILITY_CONFIRMED=true
TSS_CONTAINERD_CONFIG_VERSION=2
TSS_CONTAINERD_ROOT=/media/seu/data/tss-AIplatform/containerd
TSS_CONTAINERD_STATE_DIR=/run/tss-aiplatform/containerd
TSS_CONTAINERD_SOCKET=/run/tss-aiplatform/containerd/containerd.sock
TSS_ENABLE_NVIDIA_RUNTIME=true
TSS_STORAGE_MOUNT_POINT=/media/seu/data
TSS_EXPECTED_STORAGE_UUID=${uuid}
TSS_PROJECT_ROOT=/media/seu/data/tss-AIplatform
TSS_KUBELET_ROOT=/media/seu/data/tss-AIplatform/kubelet
TSS_MIN_STORAGE_FREE_GIB=1024
TSS_MIN_ROOT_FREE_GIB=100
TSS_POD_CIDR=10.245.0.0/16
TSS_SERVICE_CIDR=10.97.0.0/16
EOF

bash "${internal_dir}/scripts/preflight.sh" --config-only "${workdir}/control.env" >/dev/null
bash "${internal_dir}/scripts/preflight.sh" --config-only "${workdir}/worker.env" >/dev/null
bash "${internal_dir}/scripts/prepare-node.sh" --config-only "${workdir}/control.env" >/dev/null
bash "${internal_dir}/scripts/prepare-node.sh" --config-only "${workdir}/worker.env" >/dev/null
bash "${internal_dir}/scripts/import-airgap-bundles.sh" --config-only \
  "${workdir}/control.env" >/dev/null
bash "${internal_dir}/scripts/import-airgap-bundles.sh" --config-only \
  "${workdir}/worker.env" >/dev/null

bash "${internal_dir}/scripts/render-containerd-config.sh" "${workdir}/control.env" >"${workdir}/containerd-v3.toml"
grep -F 'version = 3' "${workdir}/containerd-v3.toml" >/dev/null
grep -F "[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.runc.options]" "${workdir}/containerd-v3.toml" >/dev/null
grep -F "sandbox = 'registry.k8s.io/pause:3.10.1'" "${workdir}/containerd-v3.toml" >/dev/null
if grep -F 'runtimes.nvidia' "${workdir}/containerd-v3.toml" >/dev/null; then
  echo "Control-plane runtime must remain CPU-only." >&2
  exit 1
fi

bash "${internal_dir}/scripts/render-containerd-config.sh" "${workdir}/worker.env" >"${workdir}/containerd-v2.toml"
grep -F 'version = 2' "${workdir}/containerd-v2.toml" >/dev/null
grep -F '[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]' "${workdir}/containerd-v2.toml" >/dev/null
grep -F '[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.nvidia.options]' "${workdir}/containerd-v2.toml" >/dev/null
grep -F 'default_runtime_name = "runc"' "${workdir}/containerd-v2.toml" >/dev/null
grep -F 'BinaryName = "/usr/bin/nvidia-container-runtime"' "${workdir}/containerd-v2.toml" >/dev/null

if grep -F '/var/lib/containerd' "${workdir}/containerd-v2.toml" "${workdir}/containerd-v3.toml" >/dev/null; then
  echo "Generated project runtime must not use the system containerd root." >&2
  exit 1
fi
if grep -F '/run/containerd/containerd.sock' "${workdir}/containerd-v2.toml" "${workdir}/containerd-v3.toml" >/dev/null; then
  echo "Generated project runtime must not use the system containerd socket." >&2
  exit 1
fi

bash "${internal_dir}/scripts/render-kubeadm-init.sh" "${workdir}/control.env" >"${workdir}/kubeadm.yaml"
for expected in \
  'apiVersion: kubeadm.k8s.io/v1beta4' \
  'name: tss-ai-control-01' \
  'criSocket: unix:///run/tss-aiplatform/containerd/containerd.sock' \
  'value: /srv/tss-AIplatform/kubelet' \
  'kubernetesVersion: v1.35.7' \
  'controlPlaneEndpoint: "192.0.2.10:6443"' \
  'dataDir: /var/lib/tss-aiplatform/etcd' \
  'podSubnet: 10.245.0.0/16' \
  'serviceSubnet: 10.97.0.0/16' \
  'failSwapOn: false' \
  'swapBehavior: NoSwap'; do
  grep -F "$expected" "${workdir}/kubeadm.yaml" >/dev/null
done

bash "${internal_dir}/scripts/render-containerd-unit.sh" "${workdir}/control.env" >"${workdir}/containerd.service"
grep -F 'RequiresMountsFor=/srv/tss-AIplatform' "${workdir}/containerd.service" >/dev/null
grep -F '/usr/local/lib/tss-aiplatform-internal/scripts/verify-storage.sh' "${workdir}/containerd.service" >/dev/null
grep -F 'ExecStartPre=/usr/bin/install -d -m 0755 /run/tss-aiplatform/containerd' \
  "${workdir}/containerd.service" >/dev/null

cp "${workdir}/worker.env" "${workdir}/invalid.env"
sed -i 's#TSS_CONTAINERD_ROOT=.*#TSS_CONTAINERD_ROOT=/var/lib/containerd#' "${workdir}/invalid.env"
if bash "${internal_dir}/scripts/preflight.sh" --config-only "${workdir}/invalid.env" >/dev/null 2>&1; then
  echo "System containerd root must be rejected." >&2
  exit 1
fi

cp "${workdir}/worker.env" "${workdir}/invalid-socket.env"
sed -i 's#TSS_CONTAINERD_SOCKET=.*#TSS_CONTAINERD_SOCKET=/run/containerd/containerd.sock#' "${workdir}/invalid-socket.env"
if bash "${internal_dir}/scripts/preflight.sh" --config-only "${workdir}/invalid-socket.env" >/dev/null 2>&1; then
  echo "System containerd socket must be rejected." >&2
  exit 1
fi

classifier="${internal_dir}/ci/classify-backend-deploy-scope.sh"
[[ $(printf '%s\n' 'deploy/tss-aiplatform-internal/README.md' | bash "$classifier") == deploy_main=false ]]
[[ $(printf '%s\n' '.github/workflows/tss-aiplatform-internal-validation.yml' | bash "$classifier") == deploy_main=false ]]
[[ $(printf '%s\n' 'backend/src/main/java/example.java' | bash "$classifier") == deploy_main=true ]]
[[ $(printf '%s\n' 'k8s/inference-worker/worker.py' | bash "$classifier") == deploy_main=true ]]
[[ $(printf '%s\n' 'deploy/tss-aiplatform-internal/README.md' 'backend/pom.xml' | bash "$classifier") == deploy_main=true ]]

backend_workflow="${root_dir}/.github/workflows/backend-ci.yml"
internal_workflow="${root_dir}/.github/workflows/tss-aiplatform-internal-validation.yml"
grep -F '!deploy/tss-aiplatform-internal/**' "$backend_workflow" >/dev/null
grep -F "needs.verify-and-build.outputs.deploy_main == 'true'" "$backend_workflow" >/dev/null
grep -F "steps.scope.outputs.deploy_main == 'true'" "$backend_workflow" >/dev/null
grep -F 'github.event_name }}" == "workflow_dispatch"' "$backend_workflow" >/dev/null
grep -F 'bash deploy/tss-aiplatform-internal/tests/test-cluster-copy.sh' "$internal_workflow" >/dev/null
grep -F 'environment: tss-aiplatform-internal' "$internal_workflow" >/dev/null
grep -F 'inputs.task == '\''runner-smoke'\''' "$internal_workflow" >/dev/null
grep -F 'inputs.task == '\''resolve-artifact-lock'\''' "$internal_workflow" >/dev/null
grep -F 'inputs.task == '\''export-airgap-bundles'\''' "$internal_workflow" >/dev/null
grep -F 'inputs.task == '\''stage-airgap-bundles'\''' "$internal_workflow" >/dev/null
grep -F 'actions: read' "$internal_workflow" >/dev/null
grep -F 'actions/download-artifact@v4' "$internal_workflow" >/dev/null
grep -F 'AIRGAP_STAGE_ROOT: ${{ vars.AIRGAP_STAGE_ROOT }}' "$internal_workflow" >/dev/null
grep -F 'untrusted export workflow metadata' "$internal_workflow" >/dev/null
grep -F 'test ! -L "$target_dir"' "$internal_workflow" >/dev/null
grep -F 'sha256sum --check --strict airgap-common.sha256' "$internal_workflow" >/dev/null
grep -F 'sudo, containerd import and cluster writes: not attempted' "$internal_workflow" >/dev/null
grep -F 'persist-credentials: false' "$internal_workflow" >/dev/null
grep -F 'GITHUB_WORKSPACE" == /media/seu/data/tssai-platform/actions-runner/_work/*' "$internal_workflow" >/dev/null
grep -F 'CONTROL_PLANE_HOST" =~ ^[0-9]' "$internal_workflow" >/dev/null
grep -F 'SSH authentication, sudo, deployment and host writes: not attempted' "$internal_workflow" >/dev/null
if grep -F '${{ secrets.' "$internal_workflow" >/dev/null; then
  echo "Internal validation must not consume repository or environment Secrets." >&2
  exit 1
fi
if grep -F ':latest' "${internal_dir}/versions.env" >/dev/null; then
  echo "Internal cluster versions must not use latest tags." >&2
  exit 1
fi
bash "${internal_dir}/ci/resolve-artifact-lock.sh" --validate-only >/dev/null
bash "${internal_dir}/ci/resolve-artifact-lock.sh" --self-test >/dev/null
bash "${internal_dir}/ci/export-airgap-bundles.sh" --validate-only >/dev/null
bash "${internal_dir}/scripts/prepare-storage.sh" --config-only \
  "${internal_dir}/config/seu5090-storage.env" >/dev/null

cp "${internal_dir}/config/seu5090-storage.env" "${workdir}/invalid-storage.env"
sed -i 's/TSS_STORAGE_PARTITION_GIB=2048/TSS_STORAGE_PARTITION_GIB=4096/' \
  "${workdir}/invalid-storage.env"
if bash "${internal_dir}/scripts/prepare-storage.sh" --config-only \
  "${workdir}/invalid-storage.env" >/dev/null 2>&1; then
  echo "Storage configuration must reject an unapproved partition size." >&2
  exit 1
fi

cp "${internal_dir}/config/seu5090-storage.env" "${workdir}/invalid-storage.env"
sed -i 's#TSS_STORAGE_DEVICE_BY_ID=.*#TSS_STORAGE_DEVICE_BY_ID=/dev/sda#' \
  "${workdir}/invalid-storage.env"
if bash "${internal_dir}/scripts/prepare-storage.sh" --config-only \
  "${workdir}/invalid-storage.env" >/dev/null 2>&1; then
  echo "Storage configuration must reject unstable kernel device paths." >&2
  exit 1
fi

cp "${internal_dir}/config/seu5090-storage.env" "${workdir}/invalid-storage.env"
sed -i 's/TSS_STORAGE_SMART_POLICY=.*/TSS_STORAGE_SMART_POLICY=skip-all/' \
  "${workdir}/invalid-storage.env"
if bash "${internal_dir}/scripts/prepare-storage.sh" --config-only \
  "${workdir}/invalid-storage.env" >/dev/null 2>&1; then
  echo "Storage configuration must reject an unknown SMART policy." >&2
  exit 1
fi

cp "${internal_dir}/config/seu5090-storage.env" "${workdir}/extended-storage.env"
sed -i 's/TSS_STORAGE_SMART_POLICY=.*/TSS_STORAGE_SMART_POLICY=extended/' \
  "${workdir}/extended-storage.env"
bash "${internal_dir}/scripts/prepare-storage.sh" --config-only \
  "${workdir}/extended-storage.env" >/dev/null

grep -F 'TSS_STORAGE_SMART_POLICY=short-plus-critical-attributes' \
  "${internal_dir}/config/seu5090-storage.env" >/dev/null
grep -F "TSS_STORAGE_SMART_POLICY == extended" \
  "${internal_dir}/scripts/prepare-storage.sh" >/dev/null
grep -F "latest_self_test == *'Extended offline'*" \
  "${internal_dir}/scripts/prepare-storage.sh" >/dev/null
grep -F "latest_short_test == *'Completed without error'*" \
  "${internal_dir}/scripts/prepare-storage.sh" >/dev/null
grep -F 'for attribute_id in 5 187 188 197 198 199' \
  "${internal_dir}/scripts/prepare-storage.sh" >/dev/null
grep -F 'a SMART self-test is still running' \
  "${internal_dir}/scripts/prepare-storage.sh" >/dev/null
grep -F 'sgdisk --clear' "${internal_dir}/scripts/prepare-storage.sh" >/dev/null
grep -F 'leave the remaining disk capacity unallocated' \
  "${internal_dir}/scripts/prepare-storage.sh" >/dev/null
storage_lock_line="$(grep -nF 'exec 9>/run/lock/tss-aiplatform-storage.lock' \
  "${internal_dir}/scripts/prepare-storage.sh" | cut -d: -f1)"
storage_resolve_line="$(grep -nF 'resolved_device="$(readlink -f' \
  "${internal_dir}/scripts/prepare-storage.sh" | cut -d: -f1)"
(( storage_lock_line < storage_resolve_line ))
grep -F 'mount point directory is not empty' \
  "${internal_dir}/scripts/prepare-storage.sh" >/dev/null
grep -F 'fstab verification failed; the original file was restored' \
  "${internal_dir}/scripts/prepare-storage.sh" >/dev/null
grep -F 'mount failed; the original fstab was restored' \
  "${internal_dir}/scripts/prepare-storage.sh" >/dev/null
grep -F 'configured node address is absent from the host' \
  "${internal_dir}/scripts/preflight.sh" >/dev/null
grep -F 'isolated project containerd is reachable' \
  "${internal_dir}/scripts/preflight.sh" >/dev/null
grep -F 'unexpected_kubernetes_state=' \
  "${internal_dir}/scripts/prepare-node.sh" >/dev/null
grep -F 'actual_storage_uuid=' \
  "${internal_dir}/scripts/prepare-node.sh" >/dev/null
grep -F 'existing project root is not a real directory' \
  "${internal_dir}/scripts/prepare-node.sh" >/dev/null
grep -F 'systemctl stop kubelet' \
  "${internal_dir}/scripts/prepare-node.sh" >/dev/null
grep -F 'shared system containerd PID changed' \
  "${internal_dir}/scripts/prepare-node.sh" >/dev/null
grep -F 'shared Docker container count changed' \
  "${internal_dir}/scripts/prepare-node.sh" >/dev/null
grep -F '$1 ~ /cri/ || $2 ~ /cri/' \
  "${internal_dir}/scripts/prepare-node.sh" >/dev/null
grep -F 'compression-level: 0' "$internal_workflow" >/dev/null
grep -F 'expected 7 Kubernetes core images' \
  "${internal_dir}/ci/export-airgap-bundles.sh" >/dev/null
grep -F 'bundle sources do not match the committed artifact lock' \
  "${internal_dir}/scripts/import-airgap-bundles.sh" >/dev/null
grep -F 'shared system containerd PID changed during image import' \
  "${internal_dir}/scripts/import-airgap-bundles.sh" >/dev/null
grep -Fx 'registry.k8s.io/pause:3.10.1' "${internal_dir}/core-images.txt" >/dev/null
if grep -F ':latest' "${internal_dir}/core-images.txt" >/dev/null; then
  echo "Core images must not use latest tags." >&2
  exit 1
fi

artifact_lock="${internal_dir}/artifacts.lock"
[[ -f $artifact_lock ]]
[[ $(grep -c '^manifest ' "$artifact_lock") -eq 2 ]]
[[ $(grep -c '^image ' "$artifact_lock") -eq 11 ]]
if grep -Ev '^(#.*|manifest https://[^ ]+ sha256:[0-9a-f]{64}|image [^ ]+:[^ ]+ sha256:[0-9a-f]{64})$' \
  "$artifact_lock" >/dev/null; then
  echo "Artifact lock contains an invalid line." >&2
  exit 1
fi
if grep -F ':latest ' "$artifact_lock" >/dev/null; then
  echo "Artifact lock must not use latest tags." >&2
  exit 1
fi
[[ $(awk '$1 == "image" {print $2}' "$artifact_lock" | sort | uniq -d | wc -l) -eq 0 ]]
while IFS= read -r core_image; do
  grep -E "^image ${core_image//./\\.} sha256:[0-9a-f]{64}$" "$artifact_lock" >/dev/null
done < <(grep -Ev '^(#|$)' "${internal_dir}/core-images.txt")
for required_image in \
  "quay.io/calico/cni:${TSS_CALICO_VERSION}" \
  "quay.io/calico/kube-controllers:${TSS_CALICO_VERSION}" \
  "quay.io/calico/node:${TSS_CALICO_VERSION}" \
  "nvcr.io/nvidia/k8s-device-plugin:${TSS_NVIDIA_DEVICE_PLUGIN_VERSION}"; do
  grep -E "^image ${required_image//./\\.} sha256:[0-9a-f]{64}$" "$artifact_lock" >/dev/null
done

find "${internal_dir}" -type f -name '*.sh' -print0 | xargs -0 -n1 bash -n
echo "Internal cluster copy contract tests passed."

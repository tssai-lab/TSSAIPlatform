#!/usr/bin/env bash
set -Eeuo pipefail

internal_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${internal_root}/versions.env"
core_images="${internal_root}/core-images.txt"
mode="${1:-resolve}"

calico_url="https://raw.githubusercontent.com/projectcalico/calico/${TSS_CALICO_VERSION}/manifests/calico.yaml"
nvidia_url="https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/${TSS_NVIDIA_DEVICE_PLUGIN_VERSION}/deployments/static/nvidia-device-plugin.yml"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ -f $core_images ]] || die "core image list is absent"
grep -Fx "$TSS_CONTAINERD_PAUSE_IMAGE" "$core_images" >/dev/null \
  || die "containerd pause image must match kubeadm's exact image list"
grep -Fx "registry.k8s.io/kube-apiserver:${TSS_KUBERNETES_VERSION}" "$core_images" >/dev/null \
  || die "kube-apiserver image must match the pinned Kubernetes version"
if grep -Ev '^(#.*|$|[a-z0-9.-]+(/[A-Za-z0-9._-]+)+:[A-Za-z0-9._-]+)$' "$core_images" >/dev/null; then
  die "core image list contains an invalid reference"
fi
if grep -F ':latest' "$core_images" >/dev/null; then
  die "latest image tags are forbidden"
fi
duplicate="$(grep -Ev '^(#|$)' "$core_images" | sort | uniq -d | head -n 1)"
[[ -z $duplicate ]] || die "duplicate core image: $duplicate"

if [[ $mode == --validate-only ]]; then
  echo "Artifact lock input contract passed."
  exit 0
fi
[[ $mode == resolve ]] || die "usage: $0 [--validate-only]"

for command_name in curl docker sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 \
    || die "required command is missing: $command_name"
done
docker buildx version >/dev/null 2>&1 \
  || die "Docker Buildx is required to resolve manifest-list digests"

workdir="$(mktemp -d)"
cleanup() {
  rm -rf "$workdir"
}
trap cleanup EXIT

curl --fail --location --silent --show-error \
  "$calico_url" -o "${workdir}/calico.yaml"
curl --fail --location --silent --show-error \
  "$nvidia_url" -o "${workdir}/nvidia-device-plugin.yaml"

calico_sha="$(sha256sum "${workdir}/calico.yaml" | awk '{print $1}')"
nvidia_sha="$(sha256sum "${workdir}/nvidia-device-plugin.yaml" | awk '{print $1}')"
[[ $calico_sha =~ ^[0-9a-f]{64}$ && $nvidia_sha =~ ^[0-9a-f]{64}$ ]] \
  || die "manifest SHA-256 resolution failed"

mapfile -t images < <(
  {
    grep -Ev '^(#|$)' "$core_images"
    awk '$1 == "image:" {gsub(/["'\'' ]/, "", $2); print $2}' \
      "${workdir}/calico.yaml" "${workdir}/nvidia-device-plugin.yaml"
  } | sort -u
)
(( ${#images[@]} >= 9 )) || die "resolved image set is unexpectedly small"

printf '# tss-AIplatform internal artifact lock candidate\n'
printf '# Commit this output only after independent review.\n'
printf 'manifest %s sha256:%s\n' "$calico_url" "$calico_sha"
printf 'manifest %s sha256:%s\n' "$nvidia_url" "$nvidia_sha"

for image in "${images[@]}"; do
  [[ $image != *:latest ]] || die "latest image tag is forbidden: $image"
  echo "Resolving ${image}" >&2
  digest="$(
    docker buildx imagetools inspect "$image" \
      | awk '$1 == "Digest:" {print $2; exit}'
  )"
  [[ $digest =~ ^sha256:[0-9a-f]{64}$ ]] \
    || die "invalid digest for $image: $digest"
  printf 'image %s %s\n' "$image" "$digest"
done

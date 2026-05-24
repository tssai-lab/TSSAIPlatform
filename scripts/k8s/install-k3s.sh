#!/usr/bin/env bash
set -euo pipefail

if command -v k3s >/dev/null 2>&1; then
  echo "k3s already installed"
else
  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC='--write-kubeconfig-mode=644' sh -
fi

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl get nodes -o wide

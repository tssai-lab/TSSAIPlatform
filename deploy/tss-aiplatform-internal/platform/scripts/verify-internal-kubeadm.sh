#!/usr/bin/env bash
set -Eeuo pipefail

KUBECTL="${KUBECTL:-/opt/tss-platform/.tools/bin/kubectl}"
KUBECONFIG_PATH="${KUBECONFIG:-/opt/tss-platform/k8s/backend.kubeconfig}"
namespace=tss-training

[[ -x $KUBECTL ]] || { echo "kubectl is not executable" >&2; exit 1; }
[[ -r $KUBECONFIG_PATH ]] || { echo "restricted kubeconfig is not readable" >&2; exit 1; }
kube=("$KUBECTL" --kubeconfig "$KUBECONFIG_PATH" --request-timeout=15s)

"${kube[@]}" wait --for=condition=Ready node --all --timeout=30s >/dev/null
"${kube[@]}" get namespace "$namespace" >/dev/null
for permission in \
  'create jobs.batch' \
  'delete jobs.batch' \
  'create pods' \
  'delete pods' \
  'get pods/log' \
  'get resourcequota/tss-training-quota' \
  'patch resourcequota/tss-training-quota' \
  'get configmap/tss-model-cache-policy' \
  'list nodes' \
  'list nodes.metrics.k8s.io'; do
  read -r verb resource <<<"$permission"
  [[ $("${kube[@]}" auth can-i "$verb" "$resource" -n "$namespace") == yes ]] \
    || { echo "required Kubernetes permission is missing: $permission" >&2; exit 1; }
done
[[ $("${kube[@]}" auth can-i get secrets -n "$namespace") == no ]] \
  || { echo "restricted backend identity must not read Kubernetes Secrets" >&2; exit 1; }
[[ $("${kube[@]}" auth can-i create namespaces) == no ]] \
  || { echo "restricted backend identity must not create namespaces" >&2; exit 1; }
"${kube[@]}" get --raw /apis/metrics.k8s.io/v1beta1/nodes \
  | grep -F '"items"' >/dev/null \
  || { echo "Metrics API is unavailable to the restricted backend identity" >&2; exit 1; }

cat <<'YAML' | "${kube[@]}" create --dry-run=server -f - >/dev/null
apiVersion: batch/v1
kind: Job
metadata:
  name: tss-c5-permission-probe
  namespace: tss-training
spec:
  template:
    spec:
      serviceAccountName: tss-training-worker
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: probe
          image: registry.k8s.io/pause:3.10.1
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 100m
              memory: 128Mi
YAML
echo "PASS: restricted backend kubeconfig can manage only the required platform resources"

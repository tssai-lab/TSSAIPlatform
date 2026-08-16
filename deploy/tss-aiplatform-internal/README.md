# tss-AIplatform internal cluster copy

This directory describes the independent validation cluster copied onto
seu5090 and seu4080. It does not migrate, join, drain or modify the Main/Second
cluster.

## Fixed boundaries

- Main/Second remains the CPU stable baseline and keeps its current deployment
  and data.
- The internal cluster uses the same Git commit and immutable application image
  as Main, but owns a separate Kubernetes cluster, database, object store,
  MLflow data, Secrets, logs, caches and rollback record.
- seu5090 is the control-plane/platform/storage host. Its control-plane etcd
  remains on NVMe; bulk platform data may use only the separately approved
  `tss-AIplatform` filesystem on the 8 TB disk.
- seu4080 is the first CPU/GPU worker. Existing Docker containers and all files
  outside `/media/seu/data/tss-AIplatform` are fixed external state.
- Neither host may reuse `/run/containerd/containerd.sock` or
  `/var/lib/containerd`. Both system containerd daemons are already used by
  non-project Docker workloads. Kubernetes therefore gets a dedicated service,
  socket, state directory and data root.
- The reviewed C4 installer must copy this complete directory to
  `/usr/local/lib/tss-aiplatform-internal`; the storage guard intentionally
  depends on its sibling `lib.sh` and pinned `versions.env`.
- CPU remains the default runtime. GPU Pods explicitly select the `nvidia`
  RuntimeClass, so the same manifests stay valid on Main hosts reporting zero
  GPUs.

## Stages and gates

1. **C0 evidence (complete):** read-only health, storage, network, runtime and
   port inventory. No host was changed.
2. **C1 configuration (this directory):** validate node configuration and
   render containerd/kubeadm files to stdout. The scripts do not install or
   start services.
3. **C2 delivery isolation:** validate a dedicated GitHub Environment and
   Runner without Main credentials. Record exact image digests.
4. **C3 storage gate:** partitioning or formatting seu5090 `/dev/sda` requires a
   separate explicit approval after device identity and backup evidence are
   rechecked. The existing seu4080 filesystem is never repartitioned.
5. **C4 cluster:** install the isolated runtime, run kubeadm, then network and
   node probes. Main/Second is checked before and after.
6. **C5-C8:** deploy empty platform services, prove CPU parity, enable the
   independent second deployment target, and only then add GPU behavior.

## Configuration and read-only use

Copy the appropriate example outside Git, replace every `REPLACE_*` value, and
protect it as an infrastructure file. It must contain no password, token,
kubeconfig or registry credential.

```bash
cp deploy/tss-aiplatform-internal/config/control-plane.env.example /tmp/control.env
chmod 600 /tmp/control.env
vi /tmp/control.env

bash deploy/tss-aiplatform-internal/scripts/preflight.sh --config-only /tmp/control.env
sudo bash deploy/tss-aiplatform-internal/scripts/preflight.sh /tmp/control.env

bash deploy/tss-aiplatform-internal/scripts/render-containerd-config.sh /tmp/control.env
bash deploy/tss-aiplatform-internal/scripts/render-containerd-unit.sh /tmp/control.env
bash deploy/tss-aiplatform-internal/scripts/render-kubeadm-init.sh /tmp/control.env
```

The default host preflight is observational: missing future prerequisites are
warnings. `--ready` turns them into failures and is the C4 gate. A generated
file is not authorization to install it.

## Known prerequisites not yet satisfied

- The current addresses are DHCP-derived. Their reservation or a stable DNS
  endpoint must be confirmed before kubeadm initialization.
- seu5090 has active UFW default-deny rules; reviewed node-to-node Kubernetes
  and Calico VXLAN rules are required before C4.
- `br_netfilter` is not currently loaded on either host.
- seu5090 `/dev/sda` is raw and unmounted. It has not been partitioned,
  formatted or accepted by SMART/extended health testing.
- seu4080 kubelet currently loops because `/var/lib/kubelet/config.yaml` is
  absent. That pre-existing service noise must be stopped only inside the
  approved C4 maintenance step.
- Runtime and Kubernetes image tags are fixed in `versions.env`; C2 must still
  record and verify their immutable digests before installation.

## C2 Runner and artifact lock

The existing `seu4080-platform-deploy` Runner is reused only for a manually
dispatched, no-Secrets smoke from the protected `backend-ops` branch. It checks
out the exact SHA, repeats the GitHub data path, and checks TCP/22 reachability
to the configured control-plane address. It deliberately does not attempt SSH
authentication, sudo, deployment or host writes.

The same workflow resolves an artifact lock on a GitHub-hosted Runner. This
avoids relying on the campus hosts' currently unreliable redirect from
`registry.k8s.io` to Google Artifact Registry. The reviewed result is committed
as `artifacts.lock`: its two manifest checksums and all 11 multi-architecture
image digests were independently checked against the source registries. C4
must reject a missing or mismatched artifact instead of silently using a tag.

## Rollback rule

Every environment keeps its own last-known-good SHA. If one target fails, keep
the successful target online, mark the pair `OUT_OF_SYNC`, classify the failure
as common-code or environment-specific, and retry the failed target with the
same SHA/digests. Never roll back Main merely to hide an internal environment
problem.

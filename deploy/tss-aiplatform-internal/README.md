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
   separate explicit approval after device identity and SMART evidence are
   rechecked. The existing seu4080 filesystem is never repartitioned. The
   approved operation uses the stable ATA by-id path, creates only one 2048 GiB
   ext4 partition, and leaves the remaining capacity unallocated. The disk
   reports 8090 power-on hours. The reviewed disk-specific configuration records
   the user's explicit decision to replace the extended-test gate with overall
   health, a successful short test and zero critical SMART counters.
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

The first C4 host step is deliberately narrower than cluster creation. It
installs only the reviewed project directory, root-owned node configuration,
isolated containerd unit, project directories and the Kubernetes bridge
sysctls. It stops an unconfigured kubelet but does not modify UFW, pull images,
run kubeadm or apply a CNI. The check and explicit node confirmation are
mandatory.

```bash
sudo bash deploy/tss-aiplatform-internal/scripts/prepare-node.sh \
  --check /path/to/node.env

sudo bash deploy/tss-aiplatform-internal/scripts/prepare-node.sh \
  --apply /path/to/node.env --confirm-node REPLACE_WITH_REVIEWED_NODE_NAME
```

The campus hosts can reach `registry.k8s.io` itself but time out after it
redirects to Google Artifact Registry. C4 therefore uses the no-Secrets
`export-airgap-bundles` workflow task on a GitHub-hosted Runner. It pulls the
already locked linux/amd64 image digests and emits three short-lived bundles.
Download the artifact from the exact trusted `backend-ops` run, copy only the
common files to the control plane and include the NVIDIA files on GPU workers.
The import command verifies every bundle checksum and requires `sources.lock`
to byte-match the committed 11-image lock before writing the isolated runtime.
When the operator's direct download path is unreliable, the
`stage-airgap-bundles` task may download the exact successful export run to the
reviewed `AIRGAP_STAGE_ROOT` on the protected seu4080 Runner. It verifies the
run SHA, branch, workflow, conclusion, six files, both checksum lists and the
11-image source lock. Because the campus artifact path is slow per connection,
the Runner downloads 16 strict byte ranges in parallel, then requires the
combined archive to match GitHub's whole-artifact SHA256 before extracting it.
This staging task does not use sudo, import images or write cluster state.

```bash
sudo bash deploy/tss-aiplatform-internal/scripts/import-airgap-bundles.sh \
  --check /etc/tss-aiplatform/node.env /path/to/bundles

sudo bash deploy/tss-aiplatform-internal/scripts/import-airgap-bundles.sh \
  --apply /etc/tss-aiplatform/node.env /path/to/bundles \
  --confirm-node REPLACE_WITH_REVIEWED_NODE_NAME
```

After the exact image import succeeds, prepare only the active control-plane
UFW instance. The command leaves UFW enabled and preserves its defaults and
unrelated rules. It permits the reviewed worker address to reach only the
Kubernetes API and Calico VXLAN on the control-plane address. The worker host's
inactive UFW is not enabled or otherwise changed.

```bash
sudo bash deploy/tss-aiplatform-internal/scripts/prepare-control-plane-network.sh \
  --check /etc/tss-aiplatform/node.env REPLACE_WORKER_IP

sudo bash deploy/tss-aiplatform-internal/scripts/prepare-control-plane-network.sh \
  --apply /etc/tss-aiplatform/node.env REPLACE_WORKER_IP \
  --confirm-node REPLACE_WITH_REVIEWED_NODE_NAME
```

The pinned stock Calico manifest defaults to IP-in-IP and BGP. Render it into
the reviewed VXLAN-only form before its first apply. The renderer verifies the
source checksum from `artifacts.lock`, uses the configured Pod CIDR, selects
each Kubernetes InternalIP, disables BGP/BIRD, and enables VXLAN `Always`.
This keeps the node-to-node network requirement to bidirectional UDP 4789.

```bash
bash deploy/tss-aiplatform-internal/scripts/render-calico-vxlan.sh \
  /etc/tss-aiplatform/node.env /path/to/pinned-calico.yaml \
  >/path/to/reviewed-calico-vxlan.yaml
```

The C3 storage command has a separate failure-closed check and apply mode. The
apply mode re-runs the same exact model, serial, WWN, capacity, empty-disk and
configured SMART-policy checks before its first write. It also requires the
reviewed serial on the command line. The normal policy remains a completed
extended test; a weaker disk-specific policy must be explicit in the reviewed
configuration and SOP. No policy permits a running self-test, failed overall
health, failed short test or nonzero critical counters.

```bash
sudo bash deploy/tss-aiplatform-internal/scripts/prepare-storage.sh \
  --check deploy/tss-aiplatform-internal/config/seu5090-storage.env

sudo bash deploy/tss-aiplatform-internal/scripts/prepare-storage.sh \
  --apply deploy/tss-aiplatform-internal/config/seu5090-storage.env \
  --confirm-serial REPLACE_WITH_REVIEWED_SERIAL
```

## Known prerequisites not yet satisfied

- The current addresses are DHCP-derived. The user accepted their observed
  stability for this internal validation environment only. Preflight must still
  compare the configured and actual addresses; this is not a permanent-address
  guarantee.
- seu5090 has active UFW default-deny rules; reviewed node-to-node Kubernetes
  and Calico VXLAN rules are required before C4.
- `br_netfilter` is not currently loaded on either host.
- seu5090 `/dev/sda` is raw and unmounted. Initial SMART health and the short
  test passed; the user accepted the documented weaker policy instead of
  waiting for the extended test. It has not been partitioned or formatted.
- seu4080 kubelet currently loops because `/var/lib/kubelet/config.yaml` is
  absent. That pre-existing service noise must be stopped only inside the
  approved C4 maintenance step.
- Runtime and Kubernetes image tags are fixed in `versions.env`; their C2
  immutable digest lock has been independently verified and published.

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

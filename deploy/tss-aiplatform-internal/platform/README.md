# C5 independent empty platform

This directory starts a new, empty application environment on the seu5090
control plane and connects it to the independent seu5090/seu4080 Kubernetes
cluster. It does not copy Main data, credentials, certificates, logs or
kubeconfig, and it does not modify or join the Main/Second cluster.

## What this stage contains

- four uniquely named Docker containers: PostgreSQL, MinIO, MLflow-lite and the
  backend;
- persistent data and logs only below `/srv/tss-AIplatform/platform`;
- the repository's module-one bootstrap SQL plus all Flyway migrations from the
  locked backend image;
- a Kubernetes ServiceAccount credential that is long-lived until explicitly
  revoked, but cannot read Secrets, create namespaces or act as cluster-admin;
- exact high-port and worker/Pod firewall rules, with PostgreSQL and the MinIO
  console remaining loopback-only;
- exact application image IDs resolved from immutable registry manifests.
  Compose never pulls `latest` and never builds a replacement image on the
  server. A bundle is generated from GitHub/registries without reading Main.

The C5 image set consumes about 1.58 GB before layer sharing. The scripts refuse
to proceed if the system root would violate the existing 20 GiB free-space
gate. Business data stays on the dedicated 2 TiB project filesystem.

## Minimal operator flow

1. Check out the reviewed `backend-ops` SHA into
   `/srv/tss-AIplatform/repository`. Keep the worktree clean.
2. Copy `platform.env.example` to `/etc/tss-aiplatform/platform.env`, replace
   the physical control-plane hostname and both IP placeholders, and verify the
   five ports are unused on seu5090. The physical hostname may intentionally
   differ from the Kubernetes logical node name.
3. Run `check-platform-image-budget.sh` on seu5090, then use the
   `export-platform-images` GitHub Actions task to generate the four-image
   bundle from immutable registry digests. Load the verified stream into
   seu5090 Docker. The same exporter may run on any registry-connected Docker
   host; Main is neither a source nor a required hop. Temporary
   `tss-aiplatform-internal/*` aliases and pull references are removed on exit.
4. Run the single guarded bootstrap command on seu5090:

```bash
sudo bash deploy/tss-aiplatform-internal/platform/scripts/bootstrap-platform.sh \
  --apply /etc/tss-aiplatform/node.env /etc/tss-aiplatform/platform.env \
  --confirm-node tss-ai-control-01
```

The command generates fresh local secrets without displaying them, prepares
only the internal namespace/RBAC/services and exact firewall ports, starts the
four Compose services, then verifies database, object storage, MLflow,
Kubernetes least privilege and callback authentication. Re-running `--apply`
is idempotent. It also creates one clearly named normal smoke user, proves
login, permission denial and a tiny MinIO upload/download/delete flow, and
retains the resulting audit evidence. After the first deployment, `--check`
performs the same local preflight without changing state.

## Credential and permission boundary

The backend kubeconfig is stored at
`/srv/tss-AIplatform/platform/config/backend.kubeconfig`, owned by
`root:root` with mode `0640`; only the backend container receives supplemental
group 0 to read that single bind-mounted file. Its token is independent from Main and remains
valid across ordinary service restarts, so no repeated registry or Kubernetes
login is needed. To revoke it, stop only the internal backend, delete the
`tss-backend-access-token` Secret in the internal cluster, and rerun the guarded
bootstrap to issue a replacement.

The empty deployment intentionally creates no super-administrator. Public
username registration creates only a normal user, as the existing code
requires. Selecting and promoting the first internal super-administrator is a
permission decision and is therefore a separate, recorded C5 acceptance step;
the bootstrap does not guess an account or copy Main users.

The complete no-Main-copy inventory, frontend source lock and parameterized
Nginx route are indexed in [`../reproducible/README.md`](../reproducible/README.md).

## Failure and rollback

If C5 fails, retain the new data directories and logs. Stop only the four
containers in the `tss-aiplatform-internal` Compose project and correct the
classified local cause. Do not run a global Docker prune, delete volumes, reset
Kubernetes, loosen Main, or remove any 4080/5090 non-project service. C6 CPU
training/inference and C8 GPU work remain separate stages.

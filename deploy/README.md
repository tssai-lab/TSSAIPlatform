# TSS Backend Deployment POC

This directory creates an isolated Kubernetes proof of concept. It does not use the current systemd backend, PostgreSQL data directory, MinIO data directory, public Nginx routes or production credentials.

## What the POC creates

- Namespace: `tss-poc`
- One temporary PostgreSQL instance using `emptyDir`
- One temporary MinIO instance using `emptyDir`
- One backend Deployment and ClusterIP Service
- A restricted Kubernetes ServiceAccount for the GitHub Actions deployment user

The POC data is intentionally disposable. It proves image build, pull, deployment, startup, database migration, MinIO bucket initialization and rollback mechanics. It is not a production data-storage design.

## One-time Main server bootstrap

1. Generate a dedicated SSH key pair locally. Only provide the `.pub` public key to the server bootstrap.
2. Copy `bootstrap-poc-deployer.sh` and the public key to `k8s-master`.
3. Run as root:

```bash
bash bootstrap-poc-deployer.sh /path/to/tssai_poc_deployer.pub
```

The script creates the Linux user `tss-deployer` and grants its Kubernetes identity access only to namespace `tss-poc`.

## One-time POC secret bootstrap

1. Create a GitHub personal access token with only `read:packages` for pulling the private GHCR image.
2. Add the username and token to the `poc` GitHub Environment described below.
3. After the POC CI commit is green, push one `poc-bootstrap-*` tag that points at that commit.

The workflow generates independent POC datastore credentials at runtime and writes them only to Kubernetes Secrets in `tss-poc`. It refuses to overwrite existing POC secrets.

The default `main` branch and the `backend` branch do not share Git history, so this POC uses controlled tags rather than merging backend deployment files into `main`. The existing manual triggers are retained for a future repository layout with a shared default branch.

## GitHub environment setup

Create a GitHub Environment named `poc` and add:

| Type | Name | Value |
|---|---|---|
| Variable | `POC_DEPLOY_HOST` | Main server public IP or DNS name |
| Variable | `POC_DEPLOY_USER` | `tss-deployer` |
| Variable | `POC_GHCR_USERNAME` | GitHub account that owns the package pull token |
| Secret | `POC_DEPLOY_SSH_PRIVATE_KEY` | The complete private key created for this POC |
| Secret | `POC_GHCR_PULL_TOKEN` | GitHub token with only `read:packages` |

Do not put database passwords, MinIO keys or Kubernetes tokens in GitHub Actions logs or repository files.

## Deployment and rollback

1. Push a clean integration commit to `backend-ops`; the CI workflow tests the latest backend code, builds it and publishes an image tagged with the commit SHA. Keep `ops/poc-automation` only as the historical isolated POC branch.
2. Wait for that CI run to be green.
3. Create and push a unique `poc-bootstrap-*` tag on that same commit. This runs the secret bootstrap once.
4. Create and push a different unique `poc-deploy-*` tag on that same commit. This deploys the image whose tag matches the commit SHA.
5. For a rollback, push a new `poc-deploy-*` tag that points to an earlier verified POC commit.

Example commands, replacing the names with a current unique timestamp:

```bash
git tag -a poc-bootstrap-20260715-01 -m "Bootstrap isolated backend POC"
git push origin poc-bootstrap-20260715-01

git tag -a poc-deploy-20260715-01 -m "Deploy isolated backend POC"
git push origin poc-deploy-20260715-01
```

The POC service is ClusterIP only. It does not add an external Nginx route or public port.

## Main server runtime

Main reuses its existing Docker PostgreSQL and MinIO containers. The backend and MLflow bind only to loopback. Training and inference jobs run in an isolated single-node kind cluster, so they are not scheduled onto the existing `k8s-node1` machine.

Run the training runtime bootstrap once as root from a clean repository checkout:

```bash
bash deploy/scripts/bootstrap-main-training-runtime.sh /path/to/TSSAIPlatform
bash deploy/scripts/bootstrap-main-backend.sh deploy/main/compose.backend.yml
/usr/local/sbin/tss-main-activate-backend \
  ghcr.io/tssai-lab/tssai-backend:<40-character-commit-sha>
```

The runtime bootstrap downloads checksum-pinned `kind` and `kubectl` binaries, builds MLflow and both worker images on Main, creates the kind cluster, loads the images, and verifies Pod access to the backend, MinIO and MLflow. It is idempotent and uses Docker build cache on later runs.

The Main inference image is a CPU image for the fusion/scikit-learn and OpenCV workflow. It does not include PyTorch or Ultralytics. A separate, versioned worker image is required before enabling YOLO inference on Main.

After the one-time bootstrap, every push to `backend-ops` runs backend tests, publishes an immutable GHCR image and calls the reusable Main deployment workflow. The GitHub runner streams the image through SSH, and Main replaces only `tss-backend`. The deployment waits for `http://127.0.0.1:8080/v3/api-docs`; if the new container does not become healthy, it restores the previous image.

PostgreSQL and MinIO data remain local to Main. Code rollback does not automatically roll back database data. Backup, cross-node replication and failover are separate follow-up work.

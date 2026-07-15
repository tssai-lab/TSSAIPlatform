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

1. Push a clean POC commit to `ops/poc-automation`; the CI workflow tests, builds and publishes an image tagged with the commit SHA.
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

## Main server single-machine validation

When the existing Main server backend is intentionally empty, `deploy/main/compose.backend.yml` can start the backend directly in `/opt/tss-platform` while reusing the existing Docker PostgreSQL and MinIO containers. This is a real server deployment, but it is still a single-machine validation and is not highly available.

Before enabling it, create a logical PostgreSQL backup and a MinIO archive. Then run `bootstrap-main-backend.sh` as root, pointing it at `compose.backend.yml`. The bootstrap writes server-only runtime credentials and grants `tss-deployer` permission to run exactly two root-owned scripts: GHCR login and the backend deployment.

After the matching CI commit is green, push a unique `main-deploy-*` tag on that commit. GitHub Actions pulls the immutable image on its hosted runner, streams it through SSH to Main, and then updates only the `tss-backend` container. This avoids relying on a direct large-file download from GHCR to Main. The deployment waits for `http://127.0.0.1:8080/v3/api-docs`; if the new container does not become healthy, it restores the previous backend image or removes the failed initial container.

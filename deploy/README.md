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
3. Run the manual `Bootstrap Backend POC Secrets` workflow once.

The workflow generates independent POC datastore credentials at runtime and writes them only to Kubernetes Secrets in `tss-poc`. It refuses to overwrite existing POC secrets.

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

1. Merge the Dockerfile and workflow changes after review.
2. Push a clean commit to `backend`; the CI workflow tests, builds and publishes an image tagged with the commit SHA.
3. Run `Deploy Backend POC` manually and enter that commit SHA.
4. To roll back, run the same workflow again with the previous working image SHA.

The POC service is ClusterIP only. It does not add an external Nginx route or public port.

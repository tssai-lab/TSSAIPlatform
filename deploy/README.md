# Backend Node Deployment

This directory contains the project-specific implementation for repeatable
backend deployment. It separates one-time node bootstrap from routine
application releases.

## Deployment model

- `backend-ops` is the integration branch and automatically deploys a verified
  backend image to the Main integration node.
- `backend` is the future stable backend branch. It builds an image but does
  not automatically deploy until the complete multi-node route is accepted.
- CI builds one immutable backend image tagged with the 40-character Git commit
  SHA. The target node does not pull source code or rebuild the application.
- PostgreSQL, MinIO, MLflow and the worker runtime are node dependencies. A
  normal backend release only replaces the backend container.
- Application rollback never automatically restores database data.

See `BRANCH_GOVERNANCE.md` for branch and promotion rules.

## Files

| Path | Purpose |
|---|---|
| `nodes/inventory.example.yml` | Node inventory schema without real addresses or credentials |
| `nodes/node.env.example` | Generic non-secret node configuration template |
| `nodes/main.env.example` | Current Main integration-node configuration template |
| `scripts/preflight-node.sh` | Read-only operating system, tool and capacity checks |
| `scripts/bootstrap-node-training-runtime.sh` | One-time MLflow, worker image and kind bootstrap |
| `scripts/bootstrap-node-backend.sh` | One-time backend runtime and restricted deploy-command bootstrap |
| `scripts/smoke-test-node.sh` | Repeatable non-destructive node smoke checks |
| `scripts/bootstrap-main-*.sh` | Compatibility entry points for the current Main node |

## New node procedure

1. Copy `nodes/node.env.example` outside the repository and set non-secret
   values for the target node. Protect the installed file with mode `600`.
2. Run the read-only preflight:

```bash
bash deploy/scripts/preflight-node.sh /path/to/node.env
```

3. Install Docker, Nginx and project data dependencies through their reviewed
   infrastructure runbooks. Do not place passwords in `node.env`.
4. Bootstrap the worker runtime from a clean checkout:

```bash
TSS_NODE_CONFIG=/path/to/node.env \
  bash deploy/scripts/bootstrap-node-training-runtime.sh /path/to/repository
```

5. Bootstrap the backend deploy helper:

```bash
TSS_NODE_CONFIG=/path/to/node.env \
  bash deploy/scripts/bootstrap-node-backend.sh deploy/main/compose.backend.yml
```

The backend bootstrap reads existing PostgreSQL and MinIO credentials directly
from their local containers, writes the backend runtime file with mode `600`,
and grants the deploy user permission to run only the image-load helper.

## GitHub Environment

Create a GitHub Environment named `main` with:

| Type | Name | Value |
|---|---|---|
| Variable | `DEPLOY_HOST` | Main SSH host or DNS name |
| Variable | `DEPLOY_USER` | Dedicated deployment user |
| Variable | `DEPLOY_KNOWN_HOSTS` | Offline-verified SSH host-key line |
| Secret | `DEPLOY_SSH_PRIVATE_KEY` | Private key for the dedicated deployment user |

The workflow uses the short-lived repository `GITHUB_TOKEN` to pull the image
on the GitHub runner, so no long-lived GHCR pull token is required. The image is
then streamed to the node over SSH and verified by image ID before activation.

Do not generate `DEPLOY_KNOWN_HOSTS` by trusting `ssh-keyscan` inside the same
deployment job. Verify the host key through an existing trusted channel first.

## Routine release

1. Push a reviewed commit to `backend-ops`.
2. `Backend CI and Image` runs the complete Maven verification.
3. CI publishes `ghcr.io/tssai-lab/tssai-backend:<commit-sha>`.
4. The reusable deployment workflow streams that exact image to Main.
5. Main waits for `/health/ready`; failure prints backend logs and restores the
   previously running image.
6. Run the node smoke test and archive its result:

```bash
bash deploy/scripts/smoke-test-node.sh /etc/tss-platform/node.env
```

The default smoke test is non-destructive. Authenticated and full business
closed-loop tests are enabled only with controlled test credentials and data.

## Rollback

Redeploy an earlier verified SHA through the manual workflow. Only images that
implement the standardized `/health/ready` contract are accepted by automated
rollback. Pre-standardization images require a separately reviewed manual
procedure.

## Current boundaries

- Main data is still local and is not highly available.
- Runtime worker images are published immutably, but Main remains on its
  verified local runtime images until registry promotion is accepted.
- Second is not modified by this stage.
- Multi-node traffic switching, data replication and automatic failover belong
  to later route stages.

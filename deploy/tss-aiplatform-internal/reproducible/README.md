# Reproducible deployment baseline

This directory is the index for preparing a new tss-AIplatform server without
copying files from Main. Git stores the small, reviewable inputs. Container
images remain in their registries and can be exported by GitHub Actions when an
offline bundle is needed.

## One source, no Main dependency

| Layer | Versioned source | How a new server obtains it |
|---|---|---|
| Kubernetes, Calico and NVIDIA bootstrap | `../versions.env`, `../artifacts.lock` and repository scripts | Run the existing `export-airgap-bundles` workflow task, or pull the locked digests directly. |
| PostgreSQL, MinIO, MLflow-lite and backend | `../platform/platform-images.lock` | Run the `export-platform-images` workflow task, or run `platform/scripts/export-platform-images.sh` on any registry-connected Docker host. |
| CPU training and inference images | `runtime-images.lock` | Pull the exact GHCR digests. The same commit can rebuild them with `runtime-images.yml`. |
| Frontend source | `frontend-source.lock` | Check out the exact `frontend-dev` commit and build from its lock file. Do not copy `/var/www` from Main. |
| Public Nginx routes | `nginx/frontend.conf.template` | Replace the five `REPLACE_*` values, review, run `nginx -t`, then install it for that environment. |
| Node and platform configuration | `../config/*.example` and `../platform/platform.env.example` | Create environment-owned files outside Git. |
| Passwords, tokens, certificates and kubeconfig | repository generators and Kubernetes bootstrap | Generate fresh values on the new environment. Never copy them from Main or commit them. |
| Database rows, MinIO objects, models, datasets, logs and caches | environment backup/restore process | Not part of a clean deployment baseline. Restore only when an explicitly approved data migration is required. |

The exact audit is recorded in `main-dependency-inventory.tsv`. Its final
column states whether the item is versioned, regenerated, environment-specific
or deliberately excluded.

## Why image tar files are not committed

GitHub rejects ordinary Git files above 100 MiB, and large binary history would
make every clone permanently larger. The branch therefore contains immutable
manifest digests and exporters, while GHCR/Docker Hub contain the image layers.
An exported tar is a disposable delivery artifact, not source code.

## Generate and download the platform bundle

After this workflow task is present on the reviewed integration branch, an
operator with repository access can generate the bundle without contacting
Main:

```bash
gh workflow run tss-aiplatform-internal-validation.yml \
  --ref backend-ops \
  -f task=export-platform-images

gh run list \
  --workflow tss-aiplatform-internal-validation.yml \
  --branch backend-ops \
  --event workflow_dispatch
```

Use the successful run ID and its exact commit SHA shown by GitHub:

```bash
gh run download REPLACE_RUN_ID \
  --name tss-aiplatform-platform-images-REPLACE_40_CHARACTER_SHA \
  --dir /path/to/new-empty-directory

cd /path/to/new-empty-directory
sha256sum --check --strict platform-images.sha256
docker load --input platform-images-amd64.tar
```

After import, the platform verifier checks both the immutable source baseline
and a canonical runtime-content fingerprint. This is required because Docker
29 with the containerd image store can rewrite a local image ID while retaining
the same filesystem and execution configuration; content changes are still
rejected.

The Actions artifact is intentionally retained for seven days to avoid using
GitHub as a permanent binary backup. The committed lock and exporter do not
expire; rerun the workflow to recreate the same bundle from the same digests.

## Minimal clean-server flow

1. Check out the reviewed deployment branch/SHA.
2. Install the operating-system prerequisites and pinned Kubernetes version
   documented in `../versions.env`.
3. Generate the Kubernetes air-gap bundles from GitHub Actions and import them
   with the existing guarded scripts.
4. Generate the four platform-image bundle from GitHub Actions and load it with
   `docker load`.
5. Create node/platform environment files from the committed examples and
   generate fresh Secrets.
6. Bootstrap the empty platform and run its verification scripts.
7. Build the locked frontend commit and install the reviewed Nginx template.
8. Import the locked CPU runtime images and run real CV/NLP acceptance tasks.

Steps 7 and 8 are required for a complete user-facing CPU platform. Finishing
only the four base containers is an empty-platform milestone, not full
acceptance. GPU workload images and GPU training behavior are intentionally not
claimed here because that feature has not yet completed development.

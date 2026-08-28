# Main Redis Session Store Deployment Runbook

## Purpose and boundary

Main stores Sa-Token login state in a local Redis container so a backend
container restart does not log out users whose 24-hour token is still valid.
Redis is not used as the source of truth for models, datasets or training data.
It is installed only on the application node; compute-only nodes do not need it.

The production image is fixed to:

```text
redis:7.4.11-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf
```

The container publishes `6379` only on `127.0.0.1`, uses append-only
persistence under `/opt/tss-platform/redis-data`, and has
`restart: unless-stopped`. The container limit is 256 MiB and Redis stops new
writes at 192 MiB instead of evicting existing sessions silently. Do not add a
public or LAN Redis listener.

## Deployment model

- First installation is a controlled infrastructure bootstrap because the
  existing routine workflow transfers only the backend image and cannot replace
  root-owned Compose files or helpers.
- After that one bootstrap, host reboot and routine `backend-ops` releases are
  automatic. The deployment helper starts/checks Redis before replacing the
  backend. An unhealthy Redis keeps the old backend in place.
- Routine deployment never deletes the Redis directory and never falls back to
  an in-memory session store.
- The exact Redis image is preloaded once. Routine deployment uses
  `pull_policy: never` to prevent an unreviewed tag change or network failure
  from changing infrastructure during an application release.

## Read-only preflight

Run on Main before the first bootstrap:

```bash
df -h /
ss -H -ltn 'sport = :6379'
docker ps -a --filter name='^/tss-redis$'
docker image inspect \
  'redis:7.4.11-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf'
```

The accepted first-install state is: enough node free space, no unrelated 6379
listener and no conflicting `tss-redis` container. A missing image is expected
before the pull below.

## One-time controlled bootstrap

Use a clean checkout of the reviewed backend commit. Protect the existing node
configuration and do not put credentials in Git.

```bash
redis_image='redis:7.4.11-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf'
docker pull "$redis_image"
docker image inspect "$redis_image" --format '{{.Id}}'

TSS_NODE_CONFIG=/etc/tss-platform/node.env \
  sudo -E bash deploy/scripts/bootstrap-main-backend.sh \
    deploy/main/compose.backend.yml
```

The bootstrap is idempotent. It installs the reviewed Compose overlay and
restricted helpers, preserves the existing internal callback token, writes
`AUTH_SESSION_STORE=redis` into the root-protected backend environment, creates
the persistent directory as Redis uid/gid `999:1000`, and waits for container
health. It does not restart the running backend by itself.

## Verification

After the first Redis-backed backend release:

```bash
docker inspect tss-redis \
  --format '{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}'
docker port tss-redis 6379/tcp
docker exec tss-redis redis-cli ping
curl --fail --silent http://127.0.0.1:8080/health/ready
```

Required results are the exact image above, `running healthy`, only
`127.0.0.1:6379`, `PONG`, and readiness component `authSession: UP`.

Complete the functional restart check with a controlled test account:

1. Log in and record only the test token in a temporary shell variable; never
   put it in this document, a command log or Git.
2. Confirm `/api/user/current-user` returns 200.
3. Restart only `tss-backend`; do not restart Redis.
4. Confirm the same token still returns 200.
5. Log out and confirm that token returns 401.

Also verify that password, role, status or deletion changes continue to revoke
the affected user's existing sessions through the normal application path.

## Backup and recovery

Normal backend rollback does not touch Redis and needs no session backup. If an
offline Redis backup is required, schedule a maintenance window, stop login
writes, run `redis-cli SAVE`, stop Redis, archive
`/opt/tss-platform/redis-data` with numeric ownership, and start Redis before
the backend. Validate `PONG` and `/health/ready` after restoration.

If the container is missing but the data directory remains, pull the same
digest and rerun the bootstrap. Do not point Redis at a different directory or
delete a partial AOF by hand.

Removing `/opt/tss-platform/redis-data` invalidates active sessions and is a
data-deletion operation. It requires explicit approval and a maintenance
window. Application rollback must never remove it.

## Emergency disable and rollback

If Redis cannot be recovered, keep the last healthy backend running while the
cause is investigated. Changing `AUTH_SESSION_STORE` back to `memory` is an
emergency compatibility rollback: it logs out users on the next backend
restart and removes restart persistence. Record that impact and obtain
maintenance approval before using it.

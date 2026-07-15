#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

if [[ $# -ne 1 || ! -f $1 ]]; then
  echo "Usage: $0 /path/to/compose.backend.yml" >&2
  exit 1
fi

platform_dir="/opt/tss-platform"
compose_overlay="$1"
runtime_env="${platform_dir}/backend/.env.runtime"

command -v docker >/dev/null
command -v curl >/dev/null
command -v visudo >/dev/null
docker compose version >/dev/null
docker inspect tss-postgres >/dev/null
docker inspect tss-minio >/dev/null
id tss-deployer >/dev/null

get_container_env() {
  local container="$1"
  local key="$2"

  docker inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | awk -v prefix="${key}=" 'index($0, prefix) == 1 { print substr($0, length(prefix) + 1); exit }'
}

postgres_db="$(get_container_env tss-postgres POSTGRES_DB)"
postgres_user="$(get_container_env tss-postgres POSTGRES_USER)"
postgres_password="$(get_container_env tss-postgres POSTGRES_PASSWORD)"
minio_user="$(get_container_env tss-minio MINIO_ROOT_USER)"
minio_password="$(get_container_env tss-minio MINIO_ROOT_PASSWORD)"

for value_name in postgres_db postgres_user postgres_password minio_user minio_password; do
  if [[ -z ${!value_name} ]]; then
    echo "Required runtime value ${value_name} is missing." >&2
    exit 1
  fi
done

install -d -m 700 "${platform_dir}/backend"
install -m 600 "$compose_overlay" "${platform_dir}/compose.backend.yml"

umask 077
cat > "$runtime_env" <<EOF
SERVER_ADDRESS=127.0.0.1
SPRING_PROFILES_ACTIVE=default
SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5432/${postgres_db}
SPRING_DATASOURCE_USERNAME=${postgres_user}
SPRING_DATASOURCE_PASSWORD=${postgres_password}
MINIO_ENDPOINT=http://127.0.0.1:9010
MINIO_ACCESS_KEY=${minio_user}
MINIO_SECRET_KEY=${minio_password}
MINIO_BUCKET=models
TRAINING_MLFLOW_ENABLED=false
TRAINING_K8S_ENABLED=false
TRAINING_K8S_VERIFY_ON_STARTUP=false
EOF
chmod 600 "$runtime_env"

cat > /usr/local/sbin/tss-main-login-ghcr <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

IFS= read -r username
IFS= read -r token

if [[ ! $username =~ ^[A-Za-z0-9-]+$ || -z $token ]]; then
  echo "Invalid registry credentials." >&2
  exit 1
fi

printf '%s' "$token" | docker login ghcr.io --username "$username" --password-stdin >/dev/null
EOF
chmod 700 /usr/local/sbin/tss-main-login-ghcr

cat > /usr/local/sbin/tss-main-deploy-backend <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

platform_dir="/opt/tss-platform"
compose_base="${platform_dir}/compose.yml"
compose_overlay="${platform_dir}/compose.backend.yml"
health_url="http://127.0.0.1:8080/v3/api-docs"

IFS= read -r image
if [[ ! $image =~ ^ghcr\.io/tssai-lab/tssai-backend:[0-9a-f]{40}$ ]]; then
  echo "Refusing an invalid backend image reference." >&2
  exit 1
fi

previous_image="$(docker inspect tss-backend --format '{{.Config.Image}}' 2>/dev/null || true)"
export TSS_BACKEND_IMAGE="$image"

docker compose -f "$compose_base" -f "$compose_overlay" pull backend
docker compose -f "$compose_base" -f "$compose_overlay" up -d --no-deps backend

for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 5 "$health_url" >/dev/null; then
    echo "Backend deployment is healthy: $image"
    exit 0
  fi
  sleep 2
done

echo "New backend did not become healthy; restoring the previous state." >&2
if [[ -n $previous_image ]]; then
  export TSS_BACKEND_IMAGE="$previous_image"
  docker compose -f "$compose_base" -f "$compose_overlay" up -d --no-deps backend
else
  docker compose -f "$compose_base" -f "$compose_overlay" rm -sf backend || true
fi
exit 1
EOF
chmod 700 /usr/local/sbin/tss-main-deploy-backend

cat > /etc/sudoers.d/tss-main-backend-deployer <<'EOF'
tss-deployer ALL=(root) NOPASSWD: /usr/local/sbin/tss-main-login-ghcr, /usr/local/sbin/tss-main-deploy-backend
EOF
chmod 440 /etc/sudoers.d/tss-main-backend-deployer
visudo -cf /etc/sudoers.d/tss-main-backend-deployer >/dev/null

TSS_BACKEND_IMAGE="ghcr.io/tssai-lab/tssai-backend:0000000000000000000000000000000000000000" \
  docker compose -f "${platform_dir}/compose.yml" -f "${platform_dir}/compose.backend.yml" config --quiet

echo "Main backend deployment bootstrap completed."

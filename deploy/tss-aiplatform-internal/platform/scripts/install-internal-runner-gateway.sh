#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
public_key_file=${1:-}
[[ $(id -u) -eq 0 ]] || { echo 'ERROR: gateway installation must run as root' >&2; exit 1; }
[[ -f $public_key_file && ! -L $public_key_file ]] \
  || { echo 'ERROR: reviewed Runner public key is absent or symbolic' >&2; exit 1; }
public_key=$(<"$public_key_file")
[[ $public_key =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+\ tss-aiplatform-internal-deploy$ ]] \
  || { echo 'ERROR: Runner public key format or comment differs' >&2; exit 1; }
getent passwd user >/dev/null || { echo 'ERROR: control-plane deployment user is absent' >&2; exit 1; }
ssh_dir=/home/user/.ssh
authorized_keys=${ssh_dir}/authorized_keys
[[ ! -e $ssh_dir || ( -d $ssh_dir && ! -L $ssh_dir ) ]] \
  || { echo 'ERROR: deployment user SSH directory is unsafe' >&2; exit 1; }
[[ ! -e $authorized_keys || ( -f $authorized_keys && ! -L $authorized_keys ) ]] \
  || { echo 'ERROR: authorized_keys is not a regular file' >&2; exit 1; }

install -d -o user -g user -m 0700 /srv/tss-AIplatform/staging/internal-deploy
install -o root -g root -m 0755 "${script_dir}/internal-runner-gateway.sh" \
  /usr/local/sbin/tss-aiplatform-internal-runner-gateway
install -o root -g root -m 0755 "${script_dir}/deploy-internal-backend.sh" \
  /usr/local/sbin/tss-aiplatform-internal-deploy-backend

sudoers_pending=$(mktemp /etc/sudoers.d/.tss-aiplatform-internal-deploy.XXXXXX)
trap 'rm -f "$sudoers_pending"' EXIT
printf 'user ALL=(root) NOPASSWD: /usr/local/sbin/tss-aiplatform-internal-deploy-backend\n' \
  >"$sudoers_pending"
chown root:root "$sudoers_pending"
chmod 0440 "$sudoers_pending"
visudo -cf "$sudoers_pending" >/dev/null
mv "$sudoers_pending" /etc/sudoers.d/tss-aiplatform-internal-deploy
trap - EXIT

install -d -o user -g user -m 0700 "$ssh_dir"
touch "$authorized_keys"
chown user:user "$authorized_keys"
chmod 0600 "$authorized_keys"
marker='tss-aiplatform-internal-deploy$'
pending_keys=$(mktemp /home/user/.ssh/.authorized_keys.XXXXXX)
grep -Ev "$marker" "$authorized_keys" >"$pending_keys" || true
printf 'restrict,command="/usr/local/sbin/tss-aiplatform-internal-runner-gateway" %s\n' "$public_key" \
  >>"$pending_keys"
chown user:user "$pending_keys"
chmod 0600 "$pending_keys"
mv "$pending_keys" "$authorized_keys"

echo 'PASS: restricted internal Runner gateway, fixed sudo command and staging directory installed'

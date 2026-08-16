#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${script_dir}/lib.sh"

usage() {
  echo "usage: $0 --config-only|--check /path/to/control.env WORKER_IP" >&2
  echo "       $0 --apply /path/to/control.env WORKER_IP --confirm-node NODE_NAME" >&2
  exit 2
}

mode="${1:-}"
config_file="${2:-}"
worker_ip="${3:-}"
confirmation_flag="${4:-}"
confirmation_node="${5:-}"
[[ $mode == --config-only || $mode == --check || $mode == --apply ]] || usage
[[ -n $config_file && -f $config_file && -n $worker_ip ]] || usage
if [[ $mode == --apply ]]; then
  [[ $confirmation_flag == --confirm-node && -n $confirmation_node ]] || usage
else
  [[ -z $confirmation_flag && -z $confirmation_node ]] || usage
fi

load_internal_config "$config_file"
has_role control-plane || die "network preparation must use the control-plane configuration"
TSS_WORKER_IP="$worker_ip" validate_ipv4 TSS_WORKER_IP
[[ $worker_ip != "$TSS_NODE_IP" ]] || die "worker and control-plane addresses must differ"

if [[ $mode == --config-only ]]; then
  echo "Control-plane network configuration passed: node=${TSS_NODE_NAME} worker=${worker_ip}"
  exit 0
fi

[[ $EUID -eq 0 ]] || die "control-plane network inspection and preparation must run as root"
for command_name in awk docker flock grep ip logger systemctl ufw wc; do
  command -v "$command_name" >/dev/null 2>&1 \
    || die "required command is missing: $command_name"
done

if [[ $mode == --apply ]]; then
  exec 9>/run/lock/tss-aiplatform-network-prepare.lock
  flock -n 9 || die "another network preparation is already running"
fi

route_to_worker="$(ip -4 route get "$worker_ip")"
grep -F "src ${TSS_NODE_IP}" <<<"$route_to_worker" >/dev/null \
  || die "the reviewed control-plane address is not used to reach the worker"
LC_ALL=C ufw status | grep -Fx 'Status: active' >/dev/null \
  || die "UFW must already be active; this script will not change firewall policy"
systemctl is-active --quiet docker \
  || die "shared Docker must be healthy before firewall preparation"
systemctl is-active --quiet containerd \
  || die "shared system containerd must be healthy before firewall preparation"
systemctl is-active --quiet tss-aiplatform-containerd \
  || die "project containerd must be healthy before firewall preparation"

system_containerd_pid="$(systemctl show containerd -p MainPID --value)"
docker_container_count="$(docker ps -q | wc -l)"
[[ $system_containerd_pid =~ ^[1-9][0-9]*$ ]] \
  || die "shared system containerd PID is invalid"
ufw_user_rules=/etc/ufw/user.rules
[[ -f $ufw_user_rules && ! -L $ufw_user_rules ]] \
  || die "UFW user rules file is absent or symbolic"

rule_present() {
  local port_protocol="$1"
  local port="${port_protocol%/*}"
  local protocol="${port_protocol#*/}"
  local expected="### tuple ### allow ${protocol} ${port} ${TSS_NODE_IP} any ${worker_ip} in"
  grep -F "$expected" "$ufw_user_rules" >/dev/null
}

conflicting_rule_present() {
  local port_protocol="$1"
  local port="${port_protocol%/*}"
  local protocol="${port_protocol#*/}"
  local expected="### tuple ### allow ${protocol} ${port} ${TSS_NODE_IP} any ${worker_ip} in"
  awk -v port="$port" -v protocol="$protocol" -v expected="$expected" '
    $1 == "###" && $2 == "tuple" && $3 == "###" && $4 == "allow" \
      && ($5 == protocol || $5 == "any") && $6 == port \
      && index($0, expected) != 1 {found=1}
    END {exit !found}
  ' "$ufw_user_rules"
}

for rule in '6443/tcp Kubernetes API' '4789/udp Calico VXLAN'; do
  read -r port_protocol description <<<"$rule"
  if conflicting_rule_present "$port_protocol"; then
    die "an existing ${port_protocol} rule is broader than the reviewed worker address"
  fi
  if rule_present "$port_protocol"; then
    echo "PASS: ${description} rule already permits only worker=${worker_ip}"
  else
    echo "PLAN: allow ${description} from worker=${worker_ip} to control=${TSS_NODE_IP}"
  fi
done

if [[ $mode == --check ]]; then
  echo "Control-plane network check passed without writes: node=${TSS_NODE_NAME}"
  exit 0
fi

[[ $confirmation_node == "$TSS_NODE_NAME" ]] \
  || die "confirmation node does not match the reviewed configuration"

# Validate both commands before making the first firewall write. UFW remains
# active and its defaults and unrelated rules are deliberately left unchanged.
ufw --dry-run allow proto tcp from "$worker_ip" to "$TSS_NODE_IP" port 6443 \
  comment 'tss-AIplatform worker kube-api' >/dev/null
ufw --dry-run allow proto udp from "$worker_ip" to "$TSS_NODE_IP" port 4789 \
  comment 'tss-AIplatform worker calico-vxlan' >/dev/null
ufw allow proto tcp from "$worker_ip" to "$TSS_NODE_IP" port 6443 \
  comment 'tss-AIplatform worker kube-api'
ufw allow proto udp from "$worker_ip" to "$TSS_NODE_IP" port 4789 \
  comment 'tss-AIplatform worker calico-vxlan'

rule_present 6443/tcp || die "Kubernetes API firewall rule is absent after apply"
rule_present 4789/udp || die "Calico VXLAN firewall rule is absent after apply"
[[ $(systemctl show containerd -p MainPID --value) == "$system_containerd_pid" ]] \
  || die "shared system containerd PID changed during firewall preparation"
[[ $(docker ps -q | wc -l) == "$docker_container_count" ]] \
  || die "shared Docker container count changed during firewall preparation"
systemctl is-active --quiet docker \
  || die "shared Docker is not active after firewall preparation"

logger -t tss-aiplatform-network \
  "prepare complete node=${TSS_NODE_NAME} worker=${worker_ip} ports=6443/tcp,4789/udp" \
  2>/dev/null || true
echo "Control-plane network preparation complete: node=${TSS_NODE_NAME} worker=${worker_ip}"

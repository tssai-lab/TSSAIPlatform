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
control_interface="$(
  awk '{for (i = 1; i <= NF; i++) if ($i == "dev") {print $(i + 1); exit}}' \
    <<<"$route_to_worker"
)"
[[ $control_interface =~ ^[a-zA-Z0-9_.:-]+$ ]] \
  || die "the control-plane route has no valid network interface"
LC_ALL=C ufw status | grep -Fx 'Status: active' >/dev/null \
  || die "UFW must already be active; this script will not change firewall policy"
systemctl is-active --quiet docker \
  || die "shared Docker must be healthy before firewall preparation"
systemctl is-active --quiet containerd \
  || die "shared system containerd must be healthy before firewall preparation"
systemctl is-active --quiet tss-aiplatform-containerd \
  || die "project containerd must be healthy before firewall preparation"

firewalld_active=false
firewalld_zone=''
firewalld_pod_policy=tss-pod-egress
if command -v firewall-cmd >/dev/null 2>&1 \
  && systemctl is-active --quiet firewalld; then
  [[ $(firewall-cmd --state) == running ]] \
    || die "firewalld service is active but its command interface is unavailable"
  firewalld_zone="$(firewall-cmd --get-zone-of-interface="$control_interface")"
  if [[ -z $firewalld_zone || $firewalld_zone == 'no zone' ]]; then
    firewalld_zone="$(firewall-cmd --get-default-zone)"
  fi
  [[ $firewalld_zone =~ ^[a-zA-Z0-9_-]+$ ]] \
    || die "the control-plane interface has no valid firewalld zone"
  firewalld_active=true
fi

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
  local expected_worker="### tuple ### allow ${protocol} ${port} ${TSS_NODE_IP} any ${worker_ip} in"
  local expected_pod=''
  if [[ $port_protocol == 6443/tcp ]]; then
    expected_pod="### tuple ### allow tcp 6443 ${TSS_NODE_IP} any ${TSS_POD_CIDR} in"
  fi
  awk -v port="$port" -v protocol="$protocol" -v expected_worker="$expected_worker" \
    -v expected_pod="$expected_pod" '
    $1 == "###" && $2 == "tuple" && $3 == "###" && $4 == "allow" \
      && ($5 == protocol || $5 == "any") && $6 == port \
      && index($0, expected_worker) != 1 \
      && (expected_pod == "" || index($0, expected_pod) != 1) {found=1}
    END {exit !found}
  ' "$ufw_user_rules"
}

pod_api_rule_present() {
  local expected="### tuple ### allow tcp 6443 ${TSS_NODE_IP} any ${TSS_POD_CIDR} in"
  grep -F "$expected" "$ufw_user_rules" >/dev/null
}

pod_route_rule_present() {
  local expected="### tuple ### route:allow any any 0.0.0.0/0 any ${TSS_POD_CIDR} in"
  grep -F "$expected" "$ufw_user_rules" >/dev/null
}

firewalld_rule_for() {
  local port_protocol="$1"
  local port="${port_protocol%/*}"
  local protocol="${port_protocol#*/}"
  printf 'rule family="ipv4" source address="%s/32" destination address="%s/32" port port="%s" protocol="%s" accept' \
    "$worker_ip" "$TSS_NODE_IP" "$port" "$protocol"
}

firewalld_pod_forward_rule_for() {
  printf 'rule family="ipv4" source address="%s" accept' "$TSS_POD_CIDR"
}

firewalld_rule_present() {
  local scope="$1"
  local rule="$2"
  local permanent=()
  [[ $scope == permanent ]] && permanent=(--permanent)
  firewall-cmd "${permanent[@]}" --zone="$firewalld_zone" \
    --query-rich-rule="$rule" >/dev/null
}

ensure_firewalld_rule() {
  local rule="$1"
  local added_permanent=false
  if ! firewalld_rule_present permanent "$rule"; then
    firewall-cmd --permanent --zone="$firewalld_zone" \
      --add-rich-rule="$rule" >/dev/null
    added_permanent=true
  fi
  if ! firewalld_rule_present runtime "$rule"; then
    if ! firewall-cmd --zone="$firewalld_zone" \
      --add-rich-rule="$rule" >/dev/null; then
      if [[ $added_permanent == true ]]; then
        firewall-cmd --permanent --zone="$firewalld_zone" \
          --remove-rich-rule="$rule" >/dev/null 2>&1 || true
      fi
      die "failed to add the scoped firewalld rule"
    fi
  fi
  firewalld_rule_present permanent "$rule" \
    || die "the permanent firewalld rule is absent after apply"
  firewalld_rule_present runtime "$rule" \
    || die "the runtime firewalld rule is absent after apply"
}

firewalld_policy_exists() {
  local scope="$1"
  local permanent=()
  [[ $scope == permanent ]] && permanent=(--permanent)
  firewall-cmd "${permanent[@]}" --get-policies \
    | tr ' ' '\n' | grep -Fx "$firewalld_pod_policy" >/dev/null
}

validate_firewalld_pod_policy() {
  local scope="$1"
  local permanent=()
  local expected_rule
  [[ $scope == permanent ]] && permanent=(--permanent)
  expected_rule="$(firewalld_pod_forward_rule_for)"
  [[ $(firewall-cmd "${permanent[@]}" --policy="$firewalld_pod_policy" \
    --get-target) == CONTINUE ]] \
    || die "the existing firewalld Pod policy has an unexpected target"
  [[ $(firewall-cmd "${permanent[@]}" --policy="$firewalld_pod_policy" \
    --get-priority) == -10 ]] \
    || die "the existing firewalld Pod policy has an unexpected priority"
  [[ $(firewall-cmd "${permanent[@]}" --policy="$firewalld_pod_policy" \
    --list-ingress-zones) == ANY ]] \
    || die "the existing firewalld Pod policy has unexpected ingress zones"
  [[ $(firewall-cmd "${permanent[@]}" --policy="$firewalld_pod_policy" \
    --list-egress-zones) == ANY ]] \
    || die "the existing firewalld Pod policy has unexpected egress zones"
  [[ $(firewall-cmd "${permanent[@]}" --policy="$firewalld_pod_policy" \
    --list-rich-rules) == "$expected_rule" ]] \
    || die "the existing firewalld Pod policy has unexpected rich rules"
}

create_permanent_firewalld_pod_policy() {
  local rule
  rule="$(firewalld_pod_forward_rule_for)"
  firewall-cmd --permanent --new-policy="$firewalld_pod_policy" >/dev/null
  if ! firewall-cmd --permanent --policy="$firewalld_pod_policy" \
      --set-priority=-10 >/dev/null \
    || ! firewall-cmd --permanent --policy="$firewalld_pod_policy" \
      --add-ingress-zone=ANY >/dev/null \
    || ! firewall-cmd --permanent --policy="$firewalld_pod_policy" \
      --add-egress-zone=ANY >/dev/null \
    || ! firewall-cmd --permanent --policy="$firewalld_pod_policy" \
      --add-rich-rule="$rule" >/dev/null; then
    firewall-cmd --permanent --delete-policy="$firewalld_pod_policy" \
      >/dev/null 2>&1 || true
    die "failed to create the scoped firewalld Pod forwarding policy"
  fi
}

ensure_firewalld_pod_policy() {
  if firewalld_policy_exists permanent; then
    validate_firewalld_pod_policy permanent
  else
    create_permanent_firewalld_pod_policy
    validate_firewalld_pod_policy permanent
  fi
  if ! firewalld_policy_exists runtime; then
    # firewalld only creates custom policy objects in permanent configuration.
    # A regular reload keeps connection state and is required to activate it.
    firewall-cmd --reload >/dev/null
  fi
  validate_firewalld_pod_policy permanent
  validate_firewalld_pod_policy runtime
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
if [[ $firewalld_active == true ]]; then
  for port_protocol in 6443/tcp 4789/udp; do
    firewalld_rule="$(firewalld_rule_for "$port_protocol")"
    if firewalld_rule_present runtime "$firewalld_rule" \
      && firewalld_rule_present permanent "$firewalld_rule"; then
      echo "PASS: firewalld zone=${firewalld_zone} has scoped ${port_protocol} worker rule"
    else
      echo "PLAN: add scoped ${port_protocol} worker rule to firewalld zone=${firewalld_zone}"
    fi
  done
  for scope in permanent runtime; do
    if firewalld_policy_exists "$scope"; then
      validate_firewalld_pod_policy "$scope"
    fi
  done
  if firewalld_policy_exists permanent \
    && firewalld_policy_exists runtime; then
    echo "PASS: firewalld has the scoped Pod forwarding policy"
  else
    echo "PLAN: add the scoped firewalld Pod forwarding policy"
  fi
else
  echo "PASS: firewalld is inactive; no second firewall rule set is required"
fi
if pod_api_rule_present; then
  echo "PASS: Pods from ${TSS_POD_CIDR} may reach only the host Kubernetes API port"
else
  echo "PLAN: allow Pod CIDR=${TSS_POD_CIDR} to control=${TSS_NODE_IP} TCP 6443"
fi
if pod_route_rule_present; then
  echo "PASS: Pod traffic from ${TSS_POD_CIDR} is permitted through UFW routing"
else
  echo "PLAN: allow routed traffic originating only from Pod CIDR=${TSS_POD_CIDR}"
fi

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
ufw --dry-run route allow from "$TSS_POD_CIDR" \
  comment 'tss-AIplatform pod routed traffic' >/dev/null
ufw --dry-run allow proto tcp from "$TSS_POD_CIDR" to "$TSS_NODE_IP" port 6443 \
  comment 'tss-AIplatform pod kube-api' >/dev/null
ufw allow proto tcp from "$worker_ip" to "$TSS_NODE_IP" port 6443 \
  comment 'tss-AIplatform worker kube-api'
ufw allow proto udp from "$worker_ip" to "$TSS_NODE_IP" port 4789 \
  comment 'tss-AIplatform worker calico-vxlan'
ufw allow proto tcp from "$TSS_POD_CIDR" to "$TSS_NODE_IP" port 6443 \
  comment 'tss-AIplatform pod kube-api'
ufw route allow from "$TSS_POD_CIDR" \
  comment 'tss-AIplatform pod routed traffic'

if [[ $firewalld_active == true ]]; then
  ensure_firewalld_rule "$(firewalld_rule_for 6443/tcp)"
  ensure_firewalld_rule "$(firewalld_rule_for 4789/udp)"
  ensure_firewalld_pod_policy
fi

rule_present 6443/tcp || die "Kubernetes API firewall rule is absent after apply"
rule_present 4789/udp || die "Calico VXLAN firewall rule is absent after apply"
pod_api_rule_present || die "Pod-to-Kubernetes-API firewall rule is absent after apply"
pod_route_rule_present || die "Pod routed-traffic firewall rule is absent after apply"
[[ $(systemctl show containerd -p MainPID --value) == "$system_containerd_pid" ]] \
  || die "shared system containerd PID changed during firewall preparation"
[[ $(docker ps -q | wc -l) == "$docker_container_count" ]] \
  || die "shared Docker container count changed during firewall preparation"
systemctl is-active --quiet docker \
  || die "shared Docker is not active after firewall preparation"
if [[ $firewalld_active == true ]]; then
  systemctl is-active --quiet firewalld \
    || die "firewalld is not active after firewall preparation"
fi

logger -t tss-aiplatform-network \
  "prepare complete node=${TSS_NODE_NAME} worker=${worker_ip} ports=6443/tcp,4789/udp pod-cidr=${TSS_POD_CIDR}" \
  2>/dev/null || true
echo "Control-plane network preparation complete: node=${TSS_NODE_NAME} worker=${worker_ip}"

#!/usr/bin/env bash
set -Eeuo pipefail

internal_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_var() {
  local name="$1"
  [[ -n ${!name:-} ]] || die "required setting is empty: $name"
}

validate_bool() {
  local name="$1"
  [[ ${!name:-} == true || ${!name:-} == false ]] \
    || die "$name must be true or false"
}

validate_dns_label() {
  local name="$1"
  local value="${!name:-}"
  [[ $value =~ ^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$ ]] \
    || die "$name must be a lowercase DNS label: $value"
}

validate_ipv4() {
  local name="$1"
  local value="${!name:-}"
  local octet
  local -a octets
  IFS=. read -r -a octets <<<"$value"
  [[ ${#octets[@]} -eq 4 ]] || die "$name must be an IPv4 address: $value"
  for octet in "${octets[@]}"; do
    [[ $octet =~ ^[0-9]{1,3}$ ]] && (( 10#$octet <= 255 )) \
      || die "$name must be an IPv4 address: $value"
  done
}

validate_endpoint() {
  local name="$1"
  local value="${!name:-}"
  local host="${value%:*}"
  local port="${value##*:}"
  [[ $host != "$value" && $port =~ ^[1-9][0-9]{0,4}$ && $port -le 65535 ]] \
    || die "$name must be host-or-IPv4:port: $value"
  if [[ $host =~ ^[0-9.]+$ ]]; then
    local endpoint_ip="$host"
    TSS_ENDPOINT_IP="$endpoint_ip" validate_ipv4 TSS_ENDPOINT_IP
  else
    [[ $host =~ ^[A-Za-z0-9]([-A-Za-z0-9.]{0,251}[A-Za-z0-9])?$ ]] \
      || die "$name contains an invalid host: $value"
  fi
}

validate_cidr() {
  local name="$1"
  local value="${!name:-}"
  local address="${value%/*}"
  local prefix="${value##*/}"
  [[ $address != "$value" && $prefix =~ ^[0-9]{1,2}$ && $prefix -le 32 ]] \
    || die "$name must be an IPv4 CIDR: $value"
  local cidr_ip="$address"
  TSS_CIDR_IP="$cidr_ip" validate_ipv4 TSS_CIDR_IP
}

validate_path() {
  local name="$1"
  local value="${!name:-}"
  [[ $value =~ ^/[A-Za-z0-9._/-]+$ && $value != / && $value != *//* \
    && $value != */../* && $value != */.. ]] \
    || die "$name must be a normalized absolute non-root path: $value"
}

has_role() {
  local wanted="$1"
  [[ ",${TSS_NODE_ROLES}," == *",${wanted},"* ]]
}

load_internal_config() {
  local config_file="${1:-}"
  [[ -n $config_file && -f $config_file ]] \
    || die "usage: $0 /path/to/node.env"

  set -a
  # The node file is a locally administered infrastructure file. It must not
  # contain credentials and is deliberately kept outside Git.
  # shellcheck disable=SC1090
  source "$config_file"
  # shellcheck disable=SC1091
  source "${internal_root}/versions.env"
  set +a

  local name
  for name in \
    TSS_CLUSTER_ID TSS_NODE_NAME TSS_NODE_ROLES TSS_NODE_IP \
    TSS_CONTROL_PLANE_ENDPOINT TSS_ADDRESS_STABILITY_CONFIRMED \
    TSS_CONTAINERD_CONFIG_VERSION TSS_CONTAINERD_ROOT \
    TSS_CONTAINERD_STATE_DIR TSS_CONTAINERD_SOCKET \
    TSS_ENABLE_NVIDIA_RUNTIME TSS_STORAGE_MOUNT_POINT \
    TSS_EXPECTED_STORAGE_UUID TSS_PROJECT_ROOT TSS_KUBELET_ROOT \
    TSS_MIN_STORAGE_FREE_GIB TSS_MIN_ROOT_FREE_GIB TSS_POD_CIDR \
    TSS_SERVICE_CIDR TSS_KUBERNETES_VERSION \
    TSS_CONTAINERD_PAUSE_IMAGE; do
    require_var "$name"
  done

  validate_dns_label TSS_CLUSTER_ID
  validate_dns_label TSS_NODE_NAME
  [[ $TSS_NODE_ROLES =~ ^[a-z]+(-[a-z]+)*(,[a-z]+(-[a-z]+)*)*$ ]] \
    || die "TSS_NODE_ROLES must be a comma-separated lowercase list"
  validate_ipv4 TSS_NODE_IP
  validate_endpoint TSS_CONTROL_PLANE_ENDPOINT
  validate_bool TSS_ADDRESS_STABILITY_CONFIRMED
  validate_bool TSS_ENABLE_NVIDIA_RUNTIME
  validate_cidr TSS_POD_CIDR
  validate_cidr TSS_SERVICE_CIDR

  [[ $TSS_CONTAINERD_CONFIG_VERSION == 2 || $TSS_CONTAINERD_CONFIG_VERSION == 3 ]] \
    || die "TSS_CONTAINERD_CONFIG_VERSION must be 2 or 3"
  [[ $TSS_MIN_STORAGE_FREE_GIB =~ ^[1-9][0-9]*$ ]] \
    || die "TSS_MIN_STORAGE_FREE_GIB must be a positive integer"
  [[ $TSS_MIN_ROOT_FREE_GIB =~ ^[1-9][0-9]*$ ]] \
    || die "TSS_MIN_ROOT_FREE_GIB must be a positive integer"
  [[ $TSS_EXPECTED_STORAGE_UUID =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]] \
    || die "TSS_EXPECTED_STORAGE_UUID must be the verified filesystem UUID"

  for name in TSS_CONTAINERD_ROOT TSS_CONTAINERD_STATE_DIR \
    TSS_STORAGE_MOUNT_POINT TSS_PROJECT_ROOT TSS_KUBELET_ROOT; do
    validate_path "$name"
  done
  [[ $TSS_CONTAINERD_SOCKET =~ ^/[A-Za-z0-9._/-]+\.sock$ ]] \
    || die "TSS_CONTAINERD_SOCKET must be an absolute socket path"
  [[ $TSS_CONTAINERD_SOCKET == "${TSS_CONTAINERD_STATE_DIR}/containerd.sock" ]] \
    || die "TSS_CONTAINERD_SOCKET must be inside the project state directory"

  [[ $TSS_CONTAINERD_ROOT != /var/lib/containerd ]] \
    || die "project containerd must not use Docker's /var/lib/containerd"
  [[ $TSS_CONTAINERD_SOCKET != /run/containerd/containerd.sock ]] \
    || die "project containerd must not use Docker's system socket"
  [[ $TSS_CONTAINERD_ROOT == "$TSS_PROJECT_ROOT"/* ]] \
    || die "TSS_CONTAINERD_ROOT must be below TSS_PROJECT_ROOT"
  [[ $TSS_KUBELET_ROOT == "$TSS_PROJECT_ROOT"/* ]] \
    || die "TSS_KUBELET_ROOT must be below TSS_PROJECT_ROOT"
  [[ $TSS_POD_CIDR != "$TSS_SERVICE_CIDR" ]] \
    || die "Pod and Service CIDRs must be different"
  [[ $TSS_PROJECT_ROOT == "$TSS_STORAGE_MOUNT_POINT" \
    || $TSS_PROJECT_ROOT == "$TSS_STORAGE_MOUNT_POINT"/* ]] \
    || die "TSS_PROJECT_ROOT must be on TSS_STORAGE_MOUNT_POINT"

  if has_role control-plane; then
    require_var TSS_ETCD_DATA_DIR
    validate_path TSS_ETCD_DATA_DIR
    [[ $TSS_ETCD_DATA_DIR != "$TSS_STORAGE_MOUNT_POINT" \
      && $TSS_ETCD_DATA_DIR != "$TSS_STORAGE_MOUNT_POINT"/* ]] \
      || die "etcd data must remain on the control-plane NVMe filesystem"
  fi
  if has_role gpu; then
    [[ $TSS_ENABLE_NVIDIA_RUNTIME == true ]] \
      || die "a GPU node must enable the isolated NVIDIA runtime"
  fi
}

#!/usr/bin/env bash
set -Eeuo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

repository_root=/srv/tss-AIplatform/repository
stage_root=/srv/tss-AIplatform/staging/internal-deploy
bundle_path=${stage_root}/backend.bundle
expected_user=user
origin_pattern='^(https://github\.com/|git@github\.com:|ssh://git@ssh\.github\.com:443/)tssai-lab/TSSAIPlatform(\.git)?$'

die() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ $(id -un) == "$expected_user" ]] || die "internal Runner gateway has an unexpected local user"
[[ -d $repository_root/.git && -d $stage_root && ! -L $stage_root ]] \
  || die "internal deployment paths are absent or unsafe"
[[ $(stat -c '%U:%G:%a' "$stage_root") == user:user:700 ]] \
  || die "internal deployment staging metadata differs"

command_text=${SSH_ORIGINAL_COMMAND:-}
case "$command_text" in
  probe)
    state_file=/srv/tss-AIplatform/platform/state/c7-backend-deployment.env
    state_content=$(sudo -n /usr/bin/cat "$state_file" 2>/dev/null || true)
    if [[ -n $state_content ]]; then
      grep -E '^TSS_(APPLICATION_SOURCE_SHA|INFRASTRUCTURE_SHA|BACKEND_IMAGE|CONSECUTIVE_SUCCESS_COUNT|DEPLOYED_AT_UTC)=' \
        <<<"$state_content"
    else
      echo 'TSS_C7_BACKEND_DEPLOYMENT=NOT_RECORDED'
    fi
    ;;
  sync\ *)
    requested_sha=${command_text#sync }
    [[ $requested_sha =~ ^[0-9a-f]{40}$ ]] || die "requested deployment SHA is invalid"
    [[ -z $(/usr/bin/git -C "$repository_root" status --porcelain) ]] \
      || die "deployment repository is not clean"
    [[ $(/usr/bin/git -C "$repository_root" symbolic-ref --quiet --short HEAD 2>/dev/null || true) == backend-ops ]] \
      || die "deployment repository is not on backend-ops"
    origin_url=$(/usr/bin/git -C "$repository_root" remote get-url origin)
    [[ $origin_url =~ $origin_pattern ]] || die "deployment repository origin differs"
    /usr/bin/git -C "$repository_root" fetch --prune origin backend-ops
    [[ $(/usr/bin/git -C "$repository_root" rev-parse refs/remotes/origin/backend-ops) == "$requested_sha" ]] \
      || die "requested SHA is not the current protected backend-ops head"
    /usr/bin/git -C "$repository_root" merge --ff-only "$requested_sha"
    [[ $(/usr/bin/git -C "$repository_root" rev-parse HEAD) == "$requested_sha" ]] \
      || die "deployment repository did not reach the requested SHA"
    echo "PASS: internal deployment repository synchronized to ${requested_sha}"
    ;;
  stage-backend)
    [[ ! -e $bundle_path || ( -f $bundle_path && ! -L $bundle_path \
      && $(stat -c '%U:%G:%a' "$bundle_path") == user:user:600 ) ]] \
      || die "pending backend deployment bundle metadata differs"
    pending=$(mktemp "${stage_root}/.backend.bundle.XXXXXX")
    trap 'rm -f "$pending"' EXIT
    chmod 0600 "$pending"
    # ulimit -f is expressed in 1 KiB blocks by Bash on the supported hosts.
    # The reviewed backend artifact is below 768 MiB; allow only a narrow outer-tar margin.
    ulimit -f $((800 * 1024))
    dd of="$pending" bs=1M status=none
    size=$(stat -c %s "$pending")
    (( size > 0 && size <= 800 * 1024 * 1024 )) || die "backend deployment bundle size differs"
    if [[ -f $bundle_path ]]; then
      [[ $(sha256sum "$pending" | awk '{print $1}') == $(sha256sum "$bundle_path" | awk '{print $1}') ]] \
        || die "a different backend deployment bundle is already pending"
      rm -f "$pending"
    else
      mv "$pending" "$bundle_path"
    fi
    trap - EXIT
    echo "PASS: backend deployment bundle staged (${size} bytes)"
    ;;
  deploy-backend)
    exec sudo -n /usr/local/sbin/tss-aiplatform-internal-deploy-backend
    ;;
  *)
    die "command is not permitted by the internal Runner gateway"
    ;;
esac

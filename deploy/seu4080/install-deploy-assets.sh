#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
install_root="${TSS_INSTALL_ROOT:-/media/seu/data/tssai-platform}"
timestamp="$(date +%Y%m%d-%H%M%S)"

[[ -d "$install_root" && -f "$install_root/.env" && -f "$install_root/images.env" ]] || {
  echo "existing seu4080 control stack was not found at $install_root" >&2
  exit 1
}

for file in compose.control.yml compose.frontend.yml deploy-backend-image.sh deploy-frontend-image.sh rollback-frontend.sh; do
  [[ -f "$source_dir/$file" ]] || { echo "missing deployment asset: $source_dir/$file" >&2; exit 1; }
done

backup_dir="$install_root/backups/deploy-assets-$timestamp"
mkdir -p "$backup_dir"
for file in compose.control.yml compose.frontend.yml deploy-backend-image.sh deploy-frontend-image.sh rollback-frontend.sh; do
  if [[ -f "$install_root/$file" ]]; then
    cp -p "$install_root/$file" "$backup_dir/$file"
  fi
done

install -m 0644 "$source_dir/compose.control.yml" "$install_root/compose.control.yml"
install -m 0644 "$source_dir/compose.frontend.yml" "$install_root/compose.frontend.yml"
install -m 0755 "$source_dir/deploy-backend-image.sh" "$install_root/deploy-backend-image.sh"
install -m 0755 "$source_dir/deploy-frontend-image.sh" "$install_root/deploy-frontend-image.sh"
install -m 0755 "$source_dir/rollback-frontend.sh" "$install_root/rollback-frontend.sh"

echo "installed seu4080 deployment assets; backup: $backup_dir"
echo "no service was restarted and no business image was deployed"

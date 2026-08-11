/** 在 zip / 文件清单中定位 README.md（大小写不敏感，优先根目录） */

export function isReadmeFileName(name?: string | null): boolean {
  if (!name) return false;
  const base = name.split(/[/\\]/).pop() || name;
  return /^readme\.md$/i.test(base.trim());
}

export function findReadmePath(
  paths: Array<string | null | undefined>,
): string | undefined {
  const normalized = paths
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  if (!normalized.length) return undefined;

  const rootHit = normalized.find((p) => {
    const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts.length === 1 && isReadmeFileName(parts[0]);
  });
  if (rootHit) return rootHit;

  return normalized.find((p) => isReadmeFileName(p));
}

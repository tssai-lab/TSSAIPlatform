/** 将字节数格式化为人类可读字符串 */
export function formatBytes(sizeBytes?: number | null): string {
  if (sizeBytes == null || Number.isNaN(sizeBytes)) return '-';
  if (sizeBytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(sizeBytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = sizeBytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** 千分位格式化整数 */
export function formatNumber(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toLocaleString('en-US');
}

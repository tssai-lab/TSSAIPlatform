/** 本地入口默认启用；公网接入需明确配置部署地址和反向代理。 */
export function annotationUrl(): string | undefined {
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return 'http://localhost:8010';
  return undefined;
}

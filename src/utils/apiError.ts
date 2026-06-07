/** 从 Umi request / 后端 ApiResponse 抛出的错误上取可读文案 */
export function getApiErrorMessage(err: any): string {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const bizMessage =
    err?.info?.errorMessage ||
    data?.errorMessage ||
    data?.message ||
    err?.info?.message;

  if (bizMessage) {
    return bizMessage;
  }

  if (status === 404) {
    const baseURL = (err?.config?.baseURL as string | undefined) || '';
    const url = (err?.config?.url as string | undefined) || '';
    const fullPath =
      url.startsWith('http') || url.startsWith('/api')
        ? url
        : `${baseURL.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}`;
    const springPath = data?.path as string | undefined;
    const isDatasetPreview404 = (springPath || fullPath || url || '').includes(
      '/dataset/preview',
    );

    if (isDatasetPreview404) {
      return (
        `当前后端未提供数据集预览接口 (404)：${springPath || fullPath || url}。` +
        '前端路径与版本 ID 无误；需在模块二服务中部署 module2-api-doc §13（/api/dataset/preview/files、/content、/image）。' +
        '请让后端升级你正在使用的实例（例如 :8002），或把代理指向已含预览功能的模块二版本。'
      );
    }

    return (
      `接口或资源不存在 (404)：${springPath || fullPath || url || '未知路径'}。` +
      '请确认请求路径、版本 ID 及后端是否已发布对应接口。'
    );
  }

  if (status === 502 || status === 503 || status === 504) {
    return `后端服务不可用 (${status})，请稍后重试或检查代理目标地址。`;
  }

  return err?.message || '请求失败';
}

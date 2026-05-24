/** 从 Umi request / 后端 ApiResponse 抛出的错误上取可读文案 */
export function getApiErrorMessage(err: any): string {
  return (
    err?.info?.errorMessage ||
    err?.response?.data?.errorMessage ||
    err?.info?.message ||
    err?.message ||
    '请求失败'
  );
}

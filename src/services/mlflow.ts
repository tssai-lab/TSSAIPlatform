/**
 * MLflow 模块 - Services 层
 * 从独立 MLflow 服务获取训练指标，供任务详情页展示
 * @see MLflow训练指标对接说明.md
 */
import { request } from '@umijs/max';
import { API_CONFIG } from '@/constants/platform';

/** MLflow get-history-bulk 响应格式 */
interface MlflowMetricsResponse {
  metrics?: API.MlflowMetricPoint[];
}

/** 常用指标名（与训练系统写入一致） */
export const MLFLOW_METRIC_KEYS = [
  'train_loss',
  'val_accuracy',
  'val_mAP50',
  'val_mAP50_95',
  'box_loss',
  'cls_loss',
  'dfl_loss',
] as const;

/** 从独立 MLflow 获取单个指标历史 */
export async function fetchMlflowMetricHistory(
  runId: string,
  metricKey: string,
  maxResults = 10000,
  options?: { [key: string]: any },
) {
  const url = `${API_CONFIG.ENDPOINTS.MLFLOW_METRICS_HISTORY}?run_id=${encodeURIComponent(runId)}&metric_key=${encodeURIComponent(metricKey)}&max_results=${maxResults}`;
  return request<MlflowMetricsResponse>(url, {
    method: 'GET',
    skipErrorHandler: true,
    baseURL: '', // MLflow 经 proxy 转发，不使用 /api 前缀
    ...(options || {}),
  });
}

/** 获取多个指标历史，用于图表展示 */
export async function fetchMlflowMetricsBulk(
  runId: string,
  metricKeys: string[] = [...MLFLOW_METRIC_KEYS],
  options?: { [key: string]: any },
): Promise<Record<string, { step: number; value: number }[]>> {
  const result: Record<string, { step: number; value: number }[]> = {};
  for (const key of metricKeys) {
    try {
      const res = await fetchMlflowMetricHistory(runId, key, 10000, options);
      const list = res?.metrics || [];
      result[key] = list
        .sort((a, b) => a.step - b.step)
        .map((m) => ({ step: m.step, value: m.value }));
    } catch {
      result[key] = [];
    }
  }
  return result;
}

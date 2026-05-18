import { request } from '@umijs/max';
import { API_CONFIG } from '@/constants/platform';

const mlflowBasePath =
  process.env.REACT_APP_MLFLOW_BASE_PATH || API_CONFIG.ENDPOINTS.MLFLOW_METRICS_HISTORY;

interface MlflowMetricsResponse {
  metrics?: API.MlflowMetricPoint[];
}

export const MLFLOW_METRIC_KEYS = [
  'train_loss',
  'val_accuracy',
  'val_mAP50',
  'val_mAP50_95',
  'box_loss',
  'cls_loss',
  'dfl_loss',
] as const;

export async function fetchMlflowMetricHistory(
  runId: string,
  metricKey: string,
  maxResults = 10000,
  options?: { [key: string]: any },
) {
  const url = `${mlflowBasePath}?run_id=${encodeURIComponent(runId)}&metric_key=${encodeURIComponent(metricKey)}&max_results=${maxResults}`;

  return request<MlflowMetricsResponse>(url, {
    method: 'GET',
    skipErrorHandler: true,
    baseURL: '',
    ...(options || {}),
  });
}

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

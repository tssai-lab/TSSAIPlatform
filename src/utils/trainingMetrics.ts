import type { EChartsOption } from 'echarts';

export const METRIC_LABELS: Record<string, string> = {
  train_loss: '训练损失',
  val_accuracy: '验证准确率',
  val_mAP50: '验证 mAP50',
  val_mAP50_95: '验证 mAP50-95',
};

/** 训练可视化标准 MLflow 指标（与训练脚本约定一致） */
export const TRAINING_MLFLOW_METRIC_KEYS = [
  'train_loss',
  'val_accuracy',
  'val_mAP50',
  'val_mAP50_95',
] as const;

export type TrainingMlflowMetricKey =
  (typeof TRAINING_MLFLOW_METRIC_KEYS)[number];

export type MetricPoint = { step: number; value: number };

export type MetricsDataMap = Record<string, MetricPoint[]>;

export type ChartStyle = 'combined-line' | 'split-line' | 'bar-latest';

export const CHART_STYLE_OPTIONS: { value: ChartStyle; label: string }[] = [
  { value: 'combined-line', label: '合并折线图' },
  { value: 'split-line', label: '分指标折线图' },
  { value: 'bar-latest', label: '末值柱状图' },
];

export const METRICS_POLL_INTERVAL_MS = 4000;
export const TASK_STATUS_POLL_INTERVAL_MS = 3000;

const METRIC_SUMMARY_FIELDS: { keys: string[]; label: string }[] = [
  { keys: ['train_loss', 'loss'], label: '训练损失' },
  { keys: ['val_accuracy', 'accuracy'], label: '验证准确率' },
  { keys: ['val_mAP50'], label: '验证 mAP50' },
  { keys: ['val_mAP50_95'], label: '验证 mAP50-95' },
  { keys: ['epochs', 'epoch'], label: '训练轮数' },
  { keys: ['sample_count'], label: '样本数' },
];

export function formatMetricValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(6);
  }
  return String(value);
}

export function getAvailableMetricKeys(data: MetricsDataMap): string[] {
  return TRAINING_MLFLOW_METRIC_KEYS.filter(
    (key) => (data[key]?.length ?? 0) > 0,
  );
}

export function getLatestMetricValue(
  points?: MetricPoint[],
): number | undefined {
  if (!points?.length) return undefined;
  return points[points.length - 1]!.value;
}

/** 标准 MLflow 指标末值摘要（无数据时 value 为 undefined） */
export function buildMlflowMetricSummaries(data: MetricsDataMap) {
  return TRAINING_MLFLOW_METRIC_KEYS.map((key) => ({
    key,
    label: METRIC_LABELS[key] || key,
    value: getLatestMetricValue(data[key]),
    hasData: (data[key]?.length ?? 0) > 0,
  }));
}

export function extractMetricSummaries(metrics?: Record<string, unknown>) {
  if (!metrics) return [];
  return METRIC_SUMMARY_FIELDS.map(({ keys, label }) => {
    const value = keys
      .map((key) => metrics[key])
      .find((v) => v !== undefined && v !== null && v !== '');
    return value !== undefined ? { label, value } : null;
  }).filter(Boolean) as { label: string; value: unknown }[];
}

function buildSeries(key: string, points: MetricPoint[], style: ChartStyle) {
  const name = METRIC_LABELS[key] || key;
  const data = points.map((p) => [p.step, p.value]);

  return {
    name,
    type: 'line' as const,
    smooth: style !== 'combined-line',
    showSymbol: points.length <= 30,
    data,
  };
}

export function buildMetricsChartOption(
  metricsData: MetricsDataMap,
  selectedKeys: string[],
  style: ChartStyle,
  singleKey?: string,
): EChartsOption {
  const keys = singleKey ? [singleKey] : selectedKeys;

  if (style === 'bar-latest') {
    const categories = keys.map((k) => METRIC_LABELS[k] || k);
    const values = keys.map((key) => {
      const points = metricsData[key] ?? [];
      return points.length ? points[points.length - 1]!.value : 0;
    });
    return {
      tooltip: { trigger: 'axis' },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        top: '10%',
        containLabel: true,
      },
      xAxis: { type: 'category', data: categories },
      yAxis: { type: 'value', name: 'Value' },
      series: [
        {
          type: 'bar',
          data: values,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }

  const series = keys
    .map((key) => {
      const points = metricsData[key] ?? [];
      if (!points.length) return null;
      return buildSeries(key, points, style);
    })
    .filter(Boolean);

  // 分指标子图：单系列、无 legend（标题由外层卡片展示），Y 轴按该指标自适应
  if (singleKey && style === 'split-line') {
    return {
      tooltip: { trigger: 'axis' },
      grid: {
        left: 48,
        right: 20,
        top: 28,
        bottom: 36,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: 'Step',
        nameLocation: 'middle',
        nameGap: 22,
      },
      yAxis: {
        type: 'value',
        scale: true,
      },
      series: series as EChartsOption['series'],
    };
  }

  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, type: 'scroll' },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true,
    },
    xAxis: { type: 'value', name: 'Step' },
    yAxis: { type: 'value', name: 'Value' },
    series: series as EChartsOption['series'],
  };
}

export const ACTIVE_TASK_STATUSES = new Set(['pending', 'queued', 'running']);

export function isActiveTaskStatus(status?: string) {
  return !!status && ACTIVE_TASK_STATUSES.has(status);
}

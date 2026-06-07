import { ReloadOutlined } from '@ant-design/icons';
import {
  Button,
  Input,
  Progress,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd';
import * as echarts from 'echarts';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fetchMlflowMetricsBulk } from '@/services/platform';
import {
  buildMetricsChartOption,
  buildMlflowMetricSummaries,
  CHART_STYLE_OPTIONS,
  type ChartStyle,
  extractMetricSummaries,
  formatMetricValue,
  getAvailableMetricKeys,
  isActiveTaskStatus,
  METRIC_LABELS,
  METRICS_POLL_INTERVAL_MS,
  type MetricsDataMap,
  TRAINING_MLFLOW_METRIC_KEYS,
} from '@/utils/trainingMetrics';

const CHART_STYLE_STORAGE_KEY = 'taskMetricsChartStyle';

type TrainingMetricsPanelProps = {
  runId?: string;
  taskStatus?: string;
  progress?: number;
  backendMetrics?: Record<string, unknown>;
  runIdInput?: string;
  onRunIdInputChange?: (value: string) => void;
  onManualRunId?: (runId: string) => void;
};

const TrainingMetricsPanel: React.FC<TrainingMetricsPanelProps> = ({
  runId,
  taskStatus,
  progress,
  backendMetrics,
  runIdInput = '',
  onRunIdInputChange,
  onManualRunId,
}) => {
  const [metricsData, setMetricsData] = useState<MetricsDataMap>({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('');
  const [chartStyle, setChartStyle] = useState<ChartStyle>(() => {
    const saved = localStorage.getItem(
      CHART_STYLE_STORAGE_KEY,
    ) as ChartStyle | null;
    return saved && CHART_STYLE_OPTIONS.some((o) => o.value === saved)
      ? saved
      : 'combined-line';
  });
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const combinedChartRef = useRef<HTMLDivElement>(null);
  const combinedChartInstance = useRef<echarts.ECharts | null>(null);
  const splitChartRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const splitChartInstances = useRef<Record<string, echarts.ECharts | null>>(
    {},
  );

  const isActive = isActiveTaskStatus(taskStatus);
  const shouldPoll = !!runId && autoRefresh && isActive;
  const useSplitLayout = chartStyle === 'split-line';

  const availableMetrics = useMemo(
    () => getAvailableMetricKeys(metricsData),
    [metricsData],
  );

  const effectiveSelected = useMemo(() => {
    const picked = selectedMetrics.filter((k) => availableMetrics.includes(k));
    return picked.length ? picked : availableMetrics;
  }, [selectedMetrics, availableMetrics]);

  const loadMetrics = useCallback(
    async (silent = false) => {
      if (!runId) return;
      if (!silent) setMetricsLoading(true);
      try {
        const data = await fetchMlflowMetricsBulk(runId, undefined, {
          skipErrorHandler: true,
        });
        setMetricsData(data);
        setLastUpdatedAt(new Date().toLocaleTimeString());
      } catch {
        if (!silent) setMetricsData({});
      } finally {
        if (!silent) setMetricsLoading(false);
      }
    },
    [runId],
  );

  useEffect(() => {
    if (!runId) {
      setMetricsData({});
      return;
    }
    loadMetrics(false);
  }, [runId, loadMetrics]);

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      loadMetrics(true);
    }, METRICS_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [shouldPoll, loadMetrics]);

  useEffect(() => {
    if (!availableMetrics.length) return;
    setSelectedMetrics((prev) => {
      if (!prev.length) return availableMetrics;
      const merged = [...new Set([...prev, ...availableMetrics])].filter((k) =>
        availableMetrics.includes(k),
      );
      return merged.length ? merged : availableMetrics;
    });
  }, [availableMetrics]);

  const mlflowMetricSummaries = useMemo(
    () => buildMlflowMetricSummaries(metricsData),
    [metricsData],
  );

  useEffect(() => {
    localStorage.setItem(CHART_STYLE_STORAGE_KEY, chartStyle);
  }, [chartStyle]);

  const disposeCombinedChart = useCallback(() => {
    combinedChartInstance.current?.dispose();
    combinedChartInstance.current = null;
  }, []);

  const disposeSplitCharts = useCallback(() => {
    for (const inst of Object.values(splitChartInstances.current)) {
      inst?.dispose();
    }
    splitChartInstances.current = {};
    splitChartRefs.current = {};
  }, []);

  const renderCombinedChart = useCallback(() => {
    if (!combinedChartRef.current || !effectiveSelected.length) return;
    const option = buildMetricsChartOption(
      metricsData,
      effectiveSelected,
      chartStyle,
    );
    if (!combinedChartInstance.current) {
      combinedChartInstance.current = echarts.init(combinedChartRef.current);
    }
    combinedChartInstance.current.setOption(option, { notMerge: true });
  }, [metricsData, effectiveSelected, chartStyle]);

  const renderSplitCharts = useCallback(() => {
    const activeKeys = new Set(effectiveSelected);
    Object.keys(splitChartInstances.current).forEach((key) => {
      if (!activeKeys.has(key)) {
        splitChartInstances.current[key]?.dispose();
        delete splitChartInstances.current[key];
        delete splitChartRefs.current[key];
      }
    });

    for (const key of effectiveSelected) {
      const el = splitChartRefs.current[key];
      if (!el) continue;
      const option = buildMetricsChartOption(
        metricsData,
        effectiveSelected,
        'split-line',
        key,
      );
      if (!splitChartInstances.current[key]) {
        splitChartInstances.current[key] = echarts.init(el);
      }
      splitChartInstances.current[key]?.setOption(option, { notMerge: true });
      splitChartInstances.current[key]?.resize();
    }
  }, [metricsData, effectiveSelected]);

  useEffect(() => {
    if (useSplitLayout) {
      disposeCombinedChart();
      return;
    }
    disposeSplitCharts();
  }, [useSplitLayout, disposeCombinedChart, disposeSplitCharts]);

  useLayoutEffect(() => {
    if (!useSplitLayout || !effectiveSelected.length) return;
    renderSplitCharts();
    const raf = window.requestAnimationFrame(() => {
      renderSplitCharts();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [useSplitLayout, renderSplitCharts, effectiveSelected.length]);

  useEffect(() => {
    if (useSplitLayout) return;
    renderCombinedChart();
  }, [useSplitLayout, renderCombinedChart]);

  useEffect(() => {
    const onResize = () => {
      combinedChartInstance.current?.resize();
      for (const inst of Object.values(splitChartInstances.current)) {
        inst?.resize();
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    return () => {
      disposeCombinedChart();
      disposeSplitCharts();
    };
  }, [disposeCombinedChart, disposeSplitCharts]);

  const metricSummaries = extractMetricSummaries(backendMetrics);
  const hasCharts = availableMetrics.length > 0;

  if (!runId) {
    return (
      <div style={{ padding: 24, background: '#fafafa', borderRadius: 8 }}>
        <div style={{ marginBottom: 12, color: '#8c8c8c' }}>
          任务详情未包含 run_id，或后端尚未返回。可手动输入 MLflow Run ID
          进行联调：
        </div>
        <Input.Search
          placeholder="输入 MLflow Run ID（如 abc123...）"
          value={runIdInput}
          onChange={(e) => onRunIdInputChange?.(e.target.value)}
          onSearch={(value) => onManualRunId?.(value.trim())}
          enterButton="加载指标"
          style={{ maxWidth: 480 }}
        />
        {metricSummaries.length > 0 && (
          <MetricSummaryGrid
            summaries={metricSummaries}
            style={{ marginTop: 24 }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }} align="center">
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>图表样式</span>
        <Select
          value={chartStyle}
          onChange={setChartStyle}
          options={CHART_STYLE_OPTIONS}
          style={{ width: 160 }}
        />
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>指标</span>
        <Select
          mode="multiple"
          allowClear
          placeholder="选择要绘制的指标"
          value={effectiveSelected}
          onChange={setSelectedMetrics}
          options={TRAINING_MLFLOW_METRIC_KEYS.map((k) => ({
            value: k,
            label: METRIC_LABELS[k] || k,
            disabled: !availableMetrics.includes(k),
          }))}
          style={{ minWidth: 280 }}
          maxTagCount={4}
        />
        <Button
          size="small"
          disabled={!availableMetrics.length}
          onClick={() => setSelectedMetrics([...availableMetrics])}
        >
          全选已有
        </Button>
        <Space size={4}>
          <Switch
            size="small"
            checked={autoRefresh}
            onChange={setAutoRefresh}
            disabled={!isActive}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            自动刷新
          </Typography.Text>
        </Space>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={() => loadMetrics(false)}
          loading={metricsLoading}
        >
          刷新
        </Button>
        {lastUpdatedAt && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            更新于 {lastUpdatedAt}
          </Typography.Text>
        )}
        {isActive && (
          <Tag color="processing">
            训练中 · 指标 {METRICS_POLL_INTERVAL_MS / 1000}s 刷新
          </Tag>
        )}
      </Space>

      {runId && (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, display: 'block', marginBottom: 8 }}
          >
            MLflow 指标末值（训练写入后自动更新）
          </Typography.Text>
          <MlflowMetricSummaryGrid summaries={mlflowMetricSummaries} />
        </div>
      )}

      {isActive && typeof progress === 'number' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 4, fontSize: 12, color: '#8c8c8c' }}>
            训练进度 {progress}%
          </div>
          <Progress percent={progress} status="active" />
        </div>
      )}

      {metricsLoading && !hasCharts ? (
        <div
          style={{
            height: 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spin size="large" />
        </div>
      ) : hasCharts ? (
        useSplitLayout ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {effectiveSelected.map((key) => (
              <div
                key={key}
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <Typography.Text
                  strong
                  style={{ display: 'block', marginBottom: 8 }}
                >
                  {METRIC_LABELS[key] || key}
                </Typography.Text>
                <div
                  ref={(el) => {
                    splitChartRefs.current[key] = el;
                    if (el && useSplitLayout) {
                      window.requestAnimationFrame(() => {
                        renderSplitCharts();
                      });
                    }
                  }}
                  style={{ height: 280, width: '100%', overflow: 'hidden' }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div ref={combinedChartRef} style={{ height: 400, width: '100%' }} />
        )
      ) : (
        <div
          style={{
            height: 320,
            background: '#fafafa',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8c8c8c',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, marginBottom: 8 }}>
              暂无 MLflow 指标数据
            </div>
            <div style={{ fontSize: 12 }}>
              {isActive
                ? '训练进行中，指标写入后将自动刷新；也可点击「刷新」手动拉取'
                : '请确保 MLflow 服务已启动，且该 run_id 下已写入 metrics'}
            </div>
          </div>
        </div>
      )}

      {metricSummaries.length > 0 && (
        <MetricSummaryGrid
          summaries={metricSummaries}
          style={{ marginTop: 24 }}
        />
      )}
    </div>
  );
};

function MlflowMetricSummaryGrid({
  summaries,
}: {
  summaries: ReturnType<typeof buildMlflowMetricSummaries>;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
      }}
    >
      {summaries.map(({ key, label, value, hasData }) => (
        <div
          key={key}
          style={{
            background: hasData ? '#fafafa' : '#fff',
            border: hasData ? 'none' : '1px dashed #d9d9d9',
            padding: 14,
            borderRadius: 6,
          }}
        >
          <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 6 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: hasData ? 20 : 14,
              fontWeight: hasData ? 600 : 400,
              color: hasData ? undefined : '#bfbfbf',
            }}
          >
            {hasData ? formatMetricValue(value) : '暂无数据'}
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricSummaryGrid({
  summaries,
  style,
}: {
  summaries: { label: string; value: unknown }[];
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        ...style,
      }}
    >
      {summaries.map(({ label, value }) => (
        <div
          key={label}
          style={{ background: '#fafafa', padding: 14, borderRadius: 6 }}
        >
          <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>
            {formatMetricValue(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default TrainingMetricsPanel;

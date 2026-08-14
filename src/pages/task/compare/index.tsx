/**
 * 训练后模型性能对比页
 * - 输出模型对比结果表（终值指标、排名）
 * - 多任务过程曲线对比
 * - 性能提升曲线：同一训练不同版本，或具有稳定资产标识的同一模型+同一数据集
 */
import { PageContainer } from '@ant-design/pro-components';
import { history, useSearchParams } from '@umijs/max';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Input,
  message,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import type { ColumnType } from 'antd/es/table';
import * as echarts from 'echarts';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MLFLOW_METRIC_KEYS } from '@/services/mlflow';
import {
  fetchMlflowMetricsBulk,
  fetchTaskDetail,
  fetchTaskList,
  listExperimentVersions,
} from '@/services/platform';
import { enrichTaskItemsWithDisplayNames } from '@/utils/taskDisplayNames';

const COMPARE_POOL_KEY = 'comparePoolIds';

/** 对比页优先解析 URL/对比池中的任务，否则最多解析前 20 条，避免一次打满详情 */
async function enrichFocusedTaskDisplayNames(
  list: API.TaskItem[],
  focusIds: string[],
  options?: { [key: string]: unknown },
) {
  if (!list.length) return list;
  const focus = new Set(focusIds.filter(Boolean).map(String));
  const targets = focus.size
    ? list.filter((item) => focus.has(String(item.id)))
    : list.slice(0, 20);
  if (!targets.length) return list;
  const enriched = await enrichTaskItemsWithDisplayNames(targets, options);
  const byId = new Map(enriched.map((item) => [String(item.id), item]));
  return list.map((item) => byId.get(String(item.id)) ?? item);
}
function loadComparePool(): string[] {
  try {
    const raw = localStorage.getItem(COMPARE_POOL_KEY);
    const arr = raw ? (JSON.parse(raw) as any[]) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function saveComparePool(ids: string[]) {
  const uniq = Array.from(new Set(ids.map(String))).slice(0, 30);
  localStorage.setItem(COMPARE_POOL_KEY, JSON.stringify(uniq));
  return uniq;
}

const METRIC_LABELS: Record<string, string> = {
  train_loss: '训练损失',
  val_accuracy: '验证准确率',
  val_mAP50: '验证 mAP50',
  val_mAP50_95: '验证 mAP50-95',
};

const RESULT_METRIC_PRIORITY = [
  'val_accuracy',
  'val_mAP50_95',
  'val_mAP50',
  'train_loss',
];

/** 任务项（带 runId） */
type TaskWithRunId = API.TaskItem & { runId?: string };

/** 每个任务的指标数据 */
type TaskMetricsData = {
  taskId: string;
  taskName: string;
  modelName: string;
  datasetName: string;
  modelId?: string;
  datasetId?: string;
  modelVersionId?: string;
  datasetVersionId?: string;
  experimentId?: string;
  versionNo?: number;
  createTime?: string;
  producedModelVersionId?: string;
  runId: string;
  metrics: Record<string, { step: number; value: number }[]>;
};

type ComparableGroup = {
  /** experiment：同一训练不同版本；modelDataset：同模型+同数据集 */
  kind: 'experiment' | 'modelDataset';
  slug: string;
  title: string;
  modelName: string;
  datasetName: string;
  experimentId?: string;
  tasks: TaskMetricsData[];
};

function lastPoint(series?: { step: number; value: number }[]) {
  if (!series?.length) return null;
  const sorted = [...series].sort((a, b) => a.step - b.step);
  return sorted[sorted.length - 1] ?? null;
}

function formatNum(v: number | null | undefined, digits = 4) {
  if (v == null || Number.isNaN(v)) return '-';
  return Number(v).toFixed(digits);
}

function isLowerBetter(metricKey: string) {
  return metricKey.toLowerCase().includes('loss');
}

/** 相对首个模型版本的提升率；loss 下降视为提升，其余指标上升视为提升。 */
function relativeImprovement(
  value: number,
  baseline: number,
  lowerIsBetter: boolean,
) {
  if (Math.abs(baseline) < 1e-9) {
    return Math.abs(value - baseline) < 1e-9 ? 0 : null;
  }
  const delta = lowerIsBetter ? baseline - value : value - baseline;
  return (delta / Math.abs(baseline)) * 100;
}

const TASK_COLORS = [
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
];

/** 只使用稳定资产标识分组；名称可能重复，不能作为“同一模型”的证据。 */
function modelDatasetGroupKey(r: TaskMetricsData): string | null {
  const modelKey = (r.modelId || r.modelVersionId || '').trim();
  const datasetKey = (r.datasetId || r.datasetVersionId || '').trim();
  return modelKey && datasetKey ? `${modelKey}\x1E${datasetKey}` : null;
}

/** ref / echarts 实例用的短键，避免特殊字符问题 */
function safeSlug(raw: string): string {
  return raw.replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fa5_-]/g, '_');
}

function taskIdSetKey(tasks: TaskMetricsData[]): string {
  return [...tasks.map((t) => String(t.taskId))].sort().join(',');
}

function sortTasksForCurve(tasks: TaskMetricsData[]): TaskMetricsData[] {
  return [...tasks].sort((a, b) => {
    const va = a.versionNo;
    const vb = b.versionNo;
    if (va != null && vb != null && va !== vb) return va - vb;
    const ta = Date.parse(a.createTime || '');
    const tb = Date.parse(b.createTime || '');
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return String(a.taskName).localeCompare(String(b.taskName));
  });
}

/** 性能提升分组：同一 experimentId，或具有稳定资产标识的同模型+同数据集。 */
function buildImprovementGroups(data: TaskMetricsData[]): ComparableGroup[] {
  const groups: ComparableGroup[] = [];
  const expMemberSets = new Set<string>();

  const byExp = new Map<string, TaskMetricsData[]>();
  for (const r of data) {
    const expId = (r.experimentId || '').trim();
    if (!expId) continue;
    if (!byExp.has(expId)) byExp.set(expId, []);
    byExp.get(expId)?.push(r);
  }
  for (const [expId, list] of byExp) {
    if (list.length < 2) continue;
    const tasks = sortTasksForCurve(list);
    expMemberSets.add(taskIdSetKey(tasks));
    const head = tasks[0];
    groups.push({
      kind: 'experiment',
      slug: safeSlug(`exp_${expId}`),
      title: `同一训练 · ${expId}`,
      modelName: head?.modelName || '-',
      datasetName: head?.datasetName || '-',
      experimentId: expId,
      tasks,
    });
  }

  const byMd = new Map<string, TaskMetricsData[]>();
  for (const r of data) {
    const k = modelDatasetGroupKey(r);
    if (!k) continue;
    if (!byMd.has(k)) byMd.set(k, []);
    byMd.get(k)?.push(r);
  }
  for (const [, list] of byMd) {
    if (list.length < 2) continue;
    const tasks = sortTasksForCurve(list);
    // 与某个「同一训练」组完全重合则跳过，避免重复展示
    if (expMemberSets.has(taskIdSetKey(tasks))) continue;
    const head = tasks[0];
    if (!head) continue;
    groups.push({
      kind: 'modelDataset',
      slug: safeSlug(`${head.modelName}|||${head.datasetName}`),
      title: `同模型同数据集 · ${head.modelName} / ${head.datasetName}`,
      modelName: head.modelName,
      datasetName: head.datasetName,
      tasks,
    });
  }

  return groups;
}

/** 任务列表接口：兼容 { data: TaskItem[] } 与 { data: { data, total } } */
function normalizeTaskListResponse(res: any): API.TaskItem[] {
  const d = res?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

/** 详情返回的训练实验版本 → 对比页任务行（列表里可能只有每个实验最新一条，需补全历史版本） */
function experimentVersionToTaskRow(d: any, hint?: API.TaskItem): API.TaskItem {
  return {
    id: d.id,
    name: d.name || `训练 · 第 ${d.versionNo ?? '?'} 版`,
    createTime: d.createTime || d.createdAt || '',
    status: d.status || 'pending',
    progress: typeof d.progress === 'number' ? d.progress : 0,
    modelVersionId: d.modelVersionId || hint?.modelVersionId,
    datasetVersionId: d.datasetVersionId || hint?.datasetVersionId,
    modelName:
      d.modelName && !/^(model-ver-|dataset-ver-)/i.test(d.modelName)
        ? d.modelName
        : hint?.modelName,
    datasetName:
      d.datasetName && !/^(model-ver-|dataset-ver-)/i.test(d.datasetName)
        ? d.datasetName
        : hint?.datasetName,
    experimentId: d.experimentId,
    versionNo: d.versionNo,
    producedModelVersionId:
      d.producedModelVersionId || hint?.producedModelVersionId,
  };
}

const TaskCompare: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [taskList, setTaskList] = useState<API.TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsData, setMetricsData] = useState<TaskMetricsData[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    'train_loss',
    'val_accuracy',
  ]);
  const [resultMetric, setResultMetric] = useState<string>('val_accuracy');
  /** 相同模型提升曲线使用的指标 */
  const [sameModelMetric, setSameModelMetric] =
    useState<string>('val_accuracy'); // 指标 key，与 MLflow 一致
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chartInstances = useRef<Record<string, echarts.ECharts | null>>({});
  const sameModelRawRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sameModelRawCharts = useRef<Record<string, echarts.ECharts | null>>({});
  const sameModelImpRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sameModelImpCharts = useRef<Record<string, echarts.ECharts | null>>({});
  const idsFromUrl = useMemo(() => {
    const raw = searchParams.get('ids') || '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [searchParams]);
  const experimentIdFromUrl = useMemo(
    () => searchParams.get('experimentId') || '',
    [searchParams],
  );
  const [experimentIdInput, setExperimentIdInput] = useState<string>('');
  const [comparePoolIds, setComparePoolIds] = useState<string[]>(() =>
    loadComparePool(),
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === COMPARE_POOL_KEY) setComparePoolIds(loadComparePool());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const expId = experimentIdFromUrl.trim();
        if (expId) {
          setExperimentIdInput(expId);
          try {
            const vr: any = await listExperimentVersions(expId, {
              skipErrorHandler: true,
            });
            const vers: any[] = vr?.data ?? [];
            const list: API.TaskItem[] = vers.map((d) =>
              experimentVersionToTaskRow(d),
            );
            // 确保从详情页带入的所有版本 id 都可在对比页被选中
            const want = idsFromUrl;
            const hint = list.find((t) => t.modelName && t.datasetName);
            const missing = want.filter(
              (id) => !list.some((t) => String(t.id) === String(id)),
            );
            for (const id of missing) {
              try {
                const dr = await fetchTaskDetail(id, {
                  skipErrorHandler: true,
                });
                const d: any = (dr as any)?.data;
                if (d?.id) list.unshift(experimentVersionToTaskRow(d, hint));
              } catch {
                // 详情失败则跳过，不造虚拟行
              }
            }
            setTaskList(
              await enrichFocusedTaskDisplayNames(list, idsFromUrl, {
                skipErrorHandler: true,
              }),
            );
            return;
          } catch {
            message.error('加载实验版本失败');
            setTaskList([]);
            return;
          }
        }

        const res = await fetchTaskList({ current: 1, pageSize: 200 });
        const list = normalizeTaskListResponse(res);

        const want = idsFromUrl;
        const hint = list.find((t) => t.modelName && t.datasetName);
        const missing = want.filter(
          (id) => !list.some((t) => String(t.id) === String(id)),
        );
        for (const id of missing) {
          try {
            const dr = await fetchTaskDetail(id, { skipErrorHandler: true });
            const d: any = (dr as any)?.data;
            if (d?.id) list.unshift(experimentVersionToTaskRow(d, hint));
          } catch {
            // 详情失败则跳过，不造虚拟行
          }
        }

        setTaskList(
          await enrichFocusedTaskDisplayNames(
            list,
            [...idsFromUrl, ...loadComparePool()],
            {
              skipErrorHandler: true,
            },
          ),
        );
      } catch {
        message.error('加载训练任务列表失败');
        setTaskList([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [idsFromUrl.join(','), experimentIdFromUrl]);

  const handleLoadExperiment = async () => {
    const expId = experimentIdInput.trim();
    if (!expId) {
      message.warning('请输入实验ID');
      return;
    }
    history.push(`/task/compare?experimentId=${encodeURIComponent(expId)}`);
  };

  const loadCompareData = useCallback(
    async (overrideIds?: string[]) => {
      const ids = (overrideIds ?? (selectedRowKeys as string[])).map(String);
      if (ids.length < 2) {
        message.warning('合同要求至少选择 2 个训练任务进行同屏对比');
        return;
      }
      setMetricsLoading(true);
      try {
        const idSet = new Set(ids);
        const selectedTasks = taskList.filter((t) => idSet.has(String(t.id)));
        const details: TaskWithRunId[] = [];
        for (const id of ids) {
          try {
            const res = await fetchTaskDetail(id, { skipErrorHandler: true });
            const d = (res?.data || {}) as TaskWithRunId;
            d.runId = d.runId || (res?.data as any)?.run_id;
            if (!d.id) d.id = id;
            if (!d.name) {
              d.name =
                selectedTasks.find((t) => String(t.id) === id)?.name || id;
            }
            details.push(d);
          } catch {
            // 详情失败则跳过该任务
          }
        }
        const byId = new Map(selectedTasks.map((t) => [String(t.id), t]));
        const withRunId = details.filter((d) => d.runId);
        if (withRunId.length === 0) {
          setMetricsData([]);
          message.warning('所选任务均无 Run ID，无法拉取 MLflow 指标');
          return;
        }
        if (withRunId.length < ids.length) {
          message.info(
            `部分任务无详情或 Run ID，已跳过；共 ${withRunId.length} 个任务拉取指标`,
          );
        }

        const results: TaskMetricsData[] = [];
        let failed = 0;
        for (const t of withRunId) {
          const meta = byId.get(String(t.id)) || t;
          try {
            const runId = t.runId;
            if (!runId) continue;
            const metrics = await fetchMlflowMetricsBulk(
              runId,
              MLFLOW_METRIC_KEYS as unknown as string[],
            );
            results.push({
              taskId: t.id,
              taskName: t.name || meta.name,
              modelName: meta.modelName || t.modelName || '-',
              datasetName: meta.datasetName || t.datasetName || '-',
              modelId: meta.modelId || t.modelId,
              datasetId: meta.datasetId || t.datasetId,
              modelVersionId: meta.modelVersionId || t.modelVersionId,
              datasetVersionId: meta.datasetVersionId || t.datasetVersionId,
              experimentId:
                (t as API.TaskItem).experimentId ||
                (meta as API.TaskItem).experimentId,
              versionNo:
                (t as API.TaskItem).versionNo ??
                (meta as API.TaskItem).versionNo,
              createTime:
                (t as API.TaskItem).createTime ||
                (meta as API.TaskItem).createTime,
              producedModelVersionId:
                (t as API.TaskItem).producedModelVersionId ||
                (meta as API.TaskItem).producedModelVersionId,
              runId,
              metrics,
            });
          } catch {
            failed += 1;
          }
        }
        const hasComparableMetric = MLFLOW_METRIC_KEYS.some(
          (key) =>
            results.filter((task) => task.metrics[key]?.length).length >= 2,
        );
        if (results.length < 2 || !hasComparableMetric) {
          setMetricsData([]);
          message.error(
            results.length < 2
              ? '有效训练指标不足 2 个任务，无法形成合同要求的对比'
              : '所选任务没有共同核心指标，无法进行有效对比',
          );
        } else {
          setMetricsData(results);
        }
        if (results.length >= 2 && hasComparableMetric && failed > 0) {
          message.warning(
            `已加载 ${results.length} 个任务；另有 ${failed} 个指标拉取失败已跳过`,
          );
        }
      } catch {
        setMetricsData([]);
        message.error('加载对比数据失败');
      } finally {
        setMetricsLoading(false);
      }
    },
    [selectedRowKeys, taskList],
  );

  /** 从任务详情带 ?ids= 进入：预选行并自动拉取真实指标 */
  const lastAppliedIdsRef = useRef<string>('');
  useEffect(() => {
    if (loading || taskList.length === 0) return;
    const key = idsFromUrl.join(',');
    if (!key) {
      lastAppliedIdsRef.current = '';
      return;
    }
    if (lastAppliedIdsRef.current === key) return;
    const valid = idsFromUrl.filter((id) =>
      taskList.some((t) => String(t.id) === String(id)),
    );
    if (valid.length === 0) {
      lastAppliedIdsRef.current = key;
      return;
    }
    setSelectedRowKeys(valid);
    lastAppliedIdsRef.current = key;
    if (valid.length >= 2) {
      void loadCompareData(valid);
    }
  }, [loading, taskList, idsFromUrl, loadCompareData]);

  const comparisonRows = useMemo(() => {
    if (!metricsData.length) return [];
    const rows = metricsData.map((r) => {
      const finalPoint = lastPoint(r.metrics[resultMetric]);
      return {
        key: r.taskId,
        taskName: r.taskName,
        modelName: r.modelName,
        datasetName: r.datasetName,
        producedModelVersionId: r.producedModelVersionId,
        metricValue: finalPoint?.value,
        metricStep: finalPoint?.step,
      };
    });
    const lowerIsBetter = isLowerBetter(resultMetric);
    const sorted = [...rows].sort((a, b) => {
      if (a.metricValue == null && b.metricValue == null) return 0;
      if (a.metricValue == null) return 1;
      if (b.metricValue == null) return -1;
      return lowerIsBetter
        ? a.metricValue - b.metricValue
        : b.metricValue - a.metricValue;
    });
    let ranked = 0;
    return sorted.map((row) => ({
      ...row,
      rank: row.metricValue == null ? null : ++ranked,
    }));
  }, [metricsData, resultMetric]);

  const sameModelGroups = useMemo(
    (): ComparableGroup[] => buildImprovementGroups(metricsData),
    [metricsData],
  );

  const displayedSameModelGroups = useMemo(
    () =>
      sameModelGroups.filter(
        (group) =>
          group.tasks.filter((task) => task.metrics[sameModelMetric]?.length)
            .length >= 2,
      ),
    [sameModelGroups, sameModelMetric],
  );

  // 多任务过程曲线
  useEffect(() => {
    if (metricsData.length === 0 || selectedMetrics.length === 0) return;
    const metricsToShow = selectedMetrics.filter((m) =>
      metricsData.some((t) => t.metrics[m] && t.metrics[m].length > 0),
    );
    if (metricsToShow.length === 0) return;

    metricsToShow.forEach((metricKey) => {
      const el = chartRefs.current[metricKey];
      if (!el) return;
      const series = metricsData
        .filter((t) => t.metrics[metricKey] && t.metrics[metricKey].length > 0)
        .map((t, i) => ({
          name: `${t.taskName}`,
          type: 'line' as const,
          smooth: true,
          data: t.metrics[metricKey].map((p) => [p.step, p.value]),
          itemStyle: { color: TASK_COLORS[i % TASK_COLORS.length] },
        }));
      if (series.length === 0) return;
      if (!chartInstances.current[metricKey]) {
        chartInstances.current[metricKey] = echarts.init(el);
      }
      chartInstances.current[metricKey]?.setOption({
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          top: '10%',
          containLabel: true,
        },
        xAxis: { type: 'value', name: 'Step' },
        yAxis: { type: 'value', name: 'Value' },
        series,
      });
    });

    return () => {
      metricsToShow.forEach((k) => {
        chartInstances.current[k]?.dispose();
        chartInstances.current[k] = null;
      });
    };
  }, [metricsData, selectedMetrics]);

  // 相同模型 + 相同数据集：各版本最终指标 + 相对首版提升率
  useEffect(() => {
    displayedSameModelGroups.forEach((group) => {
      const { slug, tasks: list } = group;
      const rawKey = `same_raw_${slug}`;
      const impKey = `same_imp_${slug}`;
      const metric = sameModelMetric;
      const elRaw = sameModelRawRefs.current[rawKey];
      const elImp = sameModelImpRefs.current[impKey];
      if (!elRaw || !elImp) return;

      const points = list
        .map((task) => ({ task, point: lastPoint(task.metrics[metric]) }))
        .filter(
          (
            item,
          ): item is {
            task: TaskMetricsData;
            point: { step: number; value: number };
          } => item.point != null,
        );
      const labels = points.map(({ task }) =>
        task.versionNo != null
          ? `第 ${task.versionNo} 版 · ${task.taskName}`
          : task.taskName,
      );
      const baseline = points[0]?.point.value;
      const lowerIsBetter = isLowerBetter(metric);
      const seriesRaw = [
        {
          name: METRIC_LABELS[metric] || metric,
          type: 'line' as const,
          smooth: false,
          data: points.map(({ point }) => point.value),
          itemStyle: { color: TASK_COLORS[0] },
        },
      ];
      const seriesImp = [
        {
          name: '相对首版提升率',
          type: 'line' as const,
          smooth: false,
          data: points.map(({ point }) =>
            baseline == null
              ? 0
              : relativeImprovement(point.value, baseline, lowerIsBetter),
          ),
          itemStyle: { color: TASK_COLORS[1] },
        },
      ];

      if (!sameModelRawCharts.current[rawKey]) {
        sameModelRawCharts.current[rawKey] = echarts.init(elRaw);
      }
      if (!sameModelImpCharts.current[impKey]) {
        sameModelImpCharts.current[impKey] = echarts.init(elImp);
      }
      const label = METRIC_LABELS[metric] || metric;
      sameModelRawCharts.current[rawKey]?.setOption(
        {
          tooltip: { trigger: 'axis' },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '24%',
            top: '12%',
            containLabel: true,
          },
          xAxis: {
            type: 'category',
            data: labels,
            axisLabel: { interval: 0, rotate: labels.length > 3 ? 24 : 0 },
          },
          yAxis: { type: 'value', name: label },
          series: seriesRaw,
        },
        true,
      );
      sameModelImpCharts.current[impKey]?.setOption(
        {
          tooltip: { trigger: 'axis' },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '24%',
            top: '12%',
            containLabel: true,
          },
          xAxis: {
            type: 'category',
            data: labels,
            axisLabel: { interval: 0, rotate: labels.length > 3 ? 24 : 0 },
          },
          yAxis: { type: 'value', name: '相对首版提升 (%)' },
          series: seriesImp,
        },
        true,
      );
    });

    return () => {
      Object.keys(sameModelRawCharts.current).forEach((k) => {
        sameModelRawCharts.current[k]?.dispose();
        sameModelRawCharts.current[k] = null;
      });
      Object.keys(sameModelImpCharts.current).forEach((k) => {
        sameModelImpCharts.current[k]?.dispose();
        sameModelImpCharts.current[k] = null;
      });
    };
  }, [metricsData, displayedSameModelGroups, sameModelMetric]);

  const columns: ColumnType<API.TaskItem>[] = [
    { title: '任务名称', dataIndex: 'name', key: 'name' },
    { title: '模型', dataIndex: 'modelName', key: 'modelName' },
    { title: '数据集', dataIndex: 'datasetName', key: 'datasetName' },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) => {
        const map: Record<string, string> = {
          success: '成功',
          running: '运行中',
          pending: '待执行',
          failed: '失败',
        };
        return map[v] || v;
      },
    },
  ];

  const resultColumns: ColumnType<(typeof comparisonRows)[0]>[] = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 72,
      render: (v: number | null) =>
        v == null ? (
          '-'
        ) : v === 1 ? (
          <Tag color="gold">#{v}</Tag>
        ) : v === 2 ? (
          <Tag color="default">#{v}</Tag>
        ) : (
          `#${v}`
        ),
    },
    { title: '任务名称', dataIndex: 'taskName', key: 'taskName' },
    { title: '模型', dataIndex: 'modelName', key: 'modelName' },
    { title: '数据集', dataIndex: 'datasetName', key: 'datasetName' },
    {
      title: '结果模型版本',
      dataIndex: 'producedModelVersionId',
      key: 'producedModelVersionId',
      render: (v: string | undefined) =>
        v ? (
          <span title={v}>{v.length > 18 ? `${v.slice(0, 18)}…` : v}</span>
        ) : (
          '-'
        ),
    },
    {
      title: `最终${METRIC_LABELS[resultMetric] || resultMetric}`,
      dataIndex: 'metricValue',
      key: 'metricValue',
      render: (v: number | undefined) => (v != null ? formatNum(v, 4) : '-'),
    },
    {
      title: '末值 Step',
      dataIndex: 'metricStep',
      key: 'metricStep',
      width: 120,
      render: (v: number | undefined) => (v != null ? String(v) : '-'),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  const availableMetrics = MLFLOW_METRIC_KEYS.filter((k) =>
    metricsData.some((t) => t.metrics[k] && t.metrics[k].length > 0),
  );

  const comparableMetrics = MLFLOW_METRIC_KEYS.filter(
    (key) =>
      metricsData.filter((task) => task.metrics[key]?.length).length >= 2,
  );

  const sameModelComparableMetrics = comparableMetrics.filter((key) =>
    sameModelGroups.some(
      (group) =>
        group.tasks.filter((task) => task.metrics[key]?.length).length >= 2,
    ),
  );

  useEffect(() => {
    if (!comparableMetrics.length) return;
    if (comparableMetrics.some((key) => key === resultMetric)) return;
    const next =
      RESULT_METRIC_PRIORITY.find((key) =>
        comparableMetrics.includes(key as (typeof MLFLOW_METRIC_KEYS)[number]),
      ) || comparableMetrics[0];
    if (next) setResultMetric(next);
  }, [comparableMetrics.join(','), resultMetric]);

  useEffect(() => {
    if (!availableMetrics.length) {
      setSelectedMetrics([]);
      return;
    }
    setSelectedMetrics((current) => {
      const valid = current.filter((key) =>
        availableMetrics.some((available) => available === key),
      );
      const next = Array.from(new Set([...valid, ...availableMetrics])).slice(
        0,
        Math.min(2, availableMetrics.length),
      );
      return next.join(',') === current.join(',') ? current : next;
    });
  }, [availableMetrics.join(',')]);

  const metricSelectOptions = useMemo((): string[] => {
    const up = sameModelComparableMetrics.filter(
      (k) => k.includes('accuracy') || k.includes('mAP'),
    );
    if (up.length > 0) return [...up];
    const nonLoss = sameModelComparableMetrics.filter(
      (k) => k !== 'train_loss',
    );
    if (nonLoss.length > 0) return [...nonLoss];
    return [...sameModelComparableMetrics];
  }, [sameModelComparableMetrics]);

  useEffect(() => {
    if (
      metricSelectOptions.length &&
      !metricSelectOptions.includes(sameModelMetric)
    ) {
      setSameModelMetric(metricSelectOptions[0] ?? 'val_accuracy');
    }
  }, [metricSelectOptions, sameModelMetric]);

  return (
    <PageContainer
      title="模型性能对比"
      subTitle="选择训练完成后的任务，对比终值指标与过程曲线；同一训练的不同版本，或具有相同模型/数据集资产标识的任务，可查看性能提升曲线"
      onBack={() => history.push('/task/list')}
      extra={
        <Button onClick={() => history.push('/task/list')}>返回列表</Button>
      }
    >
      <Card title="按实验ID加载版本" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            value={experimentIdInput}
            onChange={(e) => setExperimentIdInput(e.target.value)}
            placeholder="输入 experimentId（对比同一训练的多个版本）"
            style={{ width: 420 }}
          />
          <Button
            type="primary"
            onClick={handleLoadExperiment}
            loading={loading}
          >
            加载版本
          </Button>
          <Button
            onClick={() => {
              setExperimentIdInput('');
              history.push('/task/compare');
            }}
          >
            清空
          </Button>
        </Space>
        <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
          说明：任务列表接口默认只返回每个实验的最新版本；想对比同一训练的不同版本，请在此输入
          experimentId 加载版本历史。
        </div>
      </Card>

      <Card
        title="我的对比池"
        extra={
          <Space size={8}>
            <Button
              size="small"
              onClick={() => {
                const next = saveComparePool([]);
                setComparePoolIds(next);
                message.success('已清空对比池');
              }}
              disabled={comparePoolIds.length === 0}
            >
              清空
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                if (!comparePoolIds.length) {
                  message.warning('对比池为空');
                  return;
                }
                const next = Array.from(
                  new Set([
                    ...(selectedRowKeys as string[]).map(String),
                    ...comparePoolIds,
                  ]),
                );
                setSelectedRowKeys(next);
                message.success(`已加入已选（共 ${next.length} 条）`);
              }}
              disabled={comparePoolIds.length === 0}
            >
              加入已选
            </Button>
            <Button
              size="small"
              onClick={() => {
                if (comparePoolIds.length < 2) {
                  message.warning('对比池至少需要 2 条才能对比');
                  return;
                }
                history.push(
                  `/task/compare?ids=${comparePoolIds.map(encodeURIComponent).join(',')}`,
                );
              }}
              disabled={comparePoolIds.length < 2}
            >
              直接对比
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {comparePoolIds.length === 0 ? (
          <div style={{ color: '#8c8c8c' }}>
            你可以在训练详情的版本历史里点“加入对比池”，然后回到这里跨训练/跨实验统一对比。
          </div>
        ) : (
          <Space size={[8, 8]} wrap>
            {comparePoolIds.map((cid) => (
              <Tag
                key={cid}
                closable
                onClose={(e) => {
                  e.preventDefault();
                  const next = saveComparePool(
                    comparePoolIds.filter((x) => x !== cid),
                  );
                  setComparePoolIds(next);
                }}
              >
                {cid.length > 12 ? `${cid.slice(0, 12)}…` : cid}
              </Tag>
            ))}
          </Space>
        )}
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          对比池只保存版本/训练的 ID（本地存储）。进入对比页时会尽量补全这些 ID
          对应的行，并拉取真实 MLflow 指标。
        </div>
      </Card>
      <Card title="选择训练任务" style={{ marginBottom: 16 }}>
        <Table
          rowKey="id"
          rowSelection={rowSelection}
          columns={columns}
          dataSource={taskList}
          loading={loading}
          pagination={{ pageSize: 10 }}
          size="small"
        />
        <div style={{ marginTop: 16 }}>
          <Space wrap>
            <Button
              type="primary"
              onClick={() => void loadCompareData()}
              loading={metricsLoading}
              disabled={selectedRowKeys.length < 2}
            >
              加载对比数据
            </Button>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              已选 {selectedRowKeys.length}{' '}
              个任务。性能提升曲线适用于：同一训练不同版本，或具有相同模型/数据集稳定资产标识且
              ≥2 条
            </span>
          </Space>
        </div>
      </Card>

      {metricsData.length > 0 && (
        <Card
          title="模型对比结果"
          style={{ marginBottom: 16 }}
          extra={
            <Space size={8}>
              <span style={{ color: '#8c8c8c', fontSize: 12 }}>对比指标</span>
              <Select
                style={{ width: 180 }}
                value={resultMetric}
                onChange={setResultMetric}
                options={comparableMetrics.map((key) => ({
                  label: METRIC_LABELS[key] || key,
                  value: key,
                }))}
              />
              <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                {isLowerBetter(resultMetric)
                  ? '数值越低排名越高'
                  : '数值越高排名越高'}
              </span>
            </Space>
          }
        >
          <Table
            rowKey="key"
            columns={resultColumns}
            dataSource={comparisonRows}
            pagination={false}
            size="small"
          />
        </Card>
      )}

      {metricsData.length > 0 && displayedSameModelGroups.length === 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ color: '#8c8c8c' }}>
            未形成性能提升分组。请选择同一训练（同一
            experimentId）的不同版本，或具有相同模型和数据集稳定资产标识的多条任务。名称相同但资产标识不同的任务不会被误判为同一模型。
          </div>
        </Card>
      )}

      {metricsData.length > 0 && displayedSameModelGroups.length > 0 && (
        <Card
          title="性能提升曲线"
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              <span style={{ color: '#8c8c8c', fontSize: 12 }}>指标</span>
              <Select
                style={{ width: 200 }}
                value={sameModelMetric}
                onChange={setSameModelMetric}
                options={metricSelectOptions.map((k) => ({
                  label: METRIC_LABELS[k] || k,
                  value: k,
                }))}
              />
            </Space>
          }
        >
          <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 16 }}>
            分组条件：① 同一训练不同版本；②
            或模型与数据集的稳定资产标识均相同。左图比较各版本训练结束时的指标；右图展示相对首个版本的提升幅度（loss
            下降计为提升；首版指标为 0 时不伪造百分比）。
          </div>
          {displayedSameModelGroups.map((group) => {
            const { slug, title, kind, modelName, datasetName } = group;
            const rawKey = `same_raw_${slug}`;
            const impKey = `same_imp_${slug}`;
            return (
              <div key={slug} style={{ marginBottom: 32 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>
                  {title}
                  {kind === 'experiment' &&
                    (modelName !== '-' || datasetName !== '-') && (
                      <span
                        style={{
                          marginLeft: 12,
                          fontWeight: 400,
                          color: '#8c8c8c',
                          fontSize: 13,
                        }}
                      >
                        {modelName !== '-' ? `模型 ${modelName}` : ''}
                        {modelName !== '-' && datasetName !== '-' ? ' · ' : ''}
                        {datasetName !== '-' ? `数据集 ${datasetName}` : ''}
                      </span>
                    )}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ marginBottom: 8, fontSize: 13 }}>
                      {METRIC_LABELS[sameModelMetric] || sameModelMetric}
                      （各版本最终值）
                    </div>
                    <div
                      ref={(el) => {
                        if (!el && sameModelRawCharts.current[rawKey]) {
                          sameModelRawCharts.current[rawKey]?.dispose();
                          sameModelRawCharts.current[rawKey] = null;
                        }
                        sameModelRawRefs.current[rawKey] = el;
                      }}
                      style={{ height: 300, width: '100%' }}
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: 8, fontSize: 13 }}>
                      相对首个版本的提升率（%）
                    </div>
                    <div
                      ref={(el) => {
                        if (!el && sameModelImpCharts.current[impKey]) {
                          sameModelImpCharts.current[impKey]?.dispose();
                          sameModelImpCharts.current[impKey] = null;
                        }
                        sameModelImpRefs.current[impKey] = el;
                      }}
                      style={{ height: 300, width: '100%' }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {metricsData.length > 0 && (
        <Card
          title="过程参数曲线（跨任务）"
          style={{ marginBottom: 16 }}
          extra={
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              勾选指标，每个指标一张图
            </span>
          }
        >
          {availableMetrics.length > 0 ? (
            <Checkbox.Group
              value={selectedMetrics}
              onChange={(vals) => setSelectedMetrics(vals as string[])}
              options={availableMetrics.map((k) => ({
                label: METRIC_LABELS[k] || k,
                value: k,
              }))}
            />
          ) : (
            <div style={{ color: '#8c8c8c' }}>暂无可用指标序列</div>
          )}
        </Card>
      )}

      {metricsData.length > 0 &&
        availableMetrics.length > 0 &&
        selectedMetrics.length > 0 && (
          <Card title="过程曲线图">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {selectedMetrics.map((metricKey) => {
                const hasData = metricsData.some(
                  (t) => t.metrics[metricKey]?.length > 0,
                );
                if (!hasData) return null;
                return (
                  <div key={metricKey}>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>
                      {METRIC_LABELS[metricKey] || metricKey}
                    </div>
                    <div
                      ref={(el) => {
                        if (!el && chartInstances.current[metricKey]) {
                          chartInstances.current[metricKey]?.dispose();
                          chartInstances.current[metricKey] = null;
                        }
                        chartRefs.current[metricKey] = el;
                      }}
                      style={{ height: 320, width: '100%' }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        )}

      {metricsData.length > 0 && (
        <div style={{ marginTop: 16, color: '#8c8c8c', fontSize: 12 }}>
          提示：对比数据来自
          MLflow。「性能提升」适用于同一训练不同版本，或具有相同模型和数据集稳定资产标识的任务。
        </div>
      )}
    </PageContainer>
  );
};

export default TaskCompare;

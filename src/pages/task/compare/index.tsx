/**
 * 训练后模型性能对比页
 * - 输出模型对比结果表（终值指标、排名）
 * - 多任务过程曲线对比
 * - 相同模型且相同数据集：多轮训练的性能提升曲线（原始指标 + 相对起点的提升率）
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
import { genMockTaskMetrics, MOCK_TASKS } from '@/constants/mockData';
import { MLFLOW_METRIC_KEYS } from '@/services/mlflow';
import {
  fetchMlflowMetricsBulk,
  fetchTaskDetail,
  fetchTaskList,
  listExperimentVersions,
} from '@/services/platform';
import { enrichTaskItemsWithDisplayNames } from '@/utils/taskDisplayNames';

const COMPARE_POOL_KEY = 'comparePoolIds';

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

/** 任务项（带 runId） */
type TaskWithRunId = API.TaskItem & { runId?: string };

/** 每个任务的指标数据 */
type TaskMetricsData = {
  taskId: string;
  taskName: string;
  modelName: string;
  datasetName: string;
  runId: string;
  metrics: Record<string, { step: number; value: number }[]>;
};

type ComparableGroup = {
  slug: string;
  modelName: string;
  datasetName: string;
  tasks: TaskMetricsData[];
};

function lastPoint(series?: { step: number; value: number }[]) {
  if (!series?.length) return null;
  const sorted = [...series].sort((a, b) => a.step - b.step);
  return sorted[sorted.length - 1]!;
}

function formatNum(v: number | null | undefined, digits = 4) {
  if (v == null || Number.isNaN(v)) return '-';
  return Number(v).toFixed(digits);
}

/** 相对序列起点的提升率（用于准确率类指标） */
function toRelativeImprovement(series: { step: number; value: number }[]) {
  if (!series.length) return [];
  const sorted = [...series].sort((a, b) => a.step - b.step);
  const base = sorted[0]!.value;
  if (Math.abs(base) < 1e-9)
    return sorted.map((p) => ({ step: p.step, value: 0 }));
  return sorted.map((p) => ({
    step: p.step,
    value: ((p.value - base) / Math.abs(base)) * 100,
  }));
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

/** 可对比组键：模型名 + 数据集名 同时一致（同一架构换数据集不应混在同一提升曲线组） */
function comparableGroupKey(r: TaskMetricsData): string {
  const m = (r.modelName || '_unknown').trim();
  const d = (r.datasetName || '_unknown').trim();
  return `${m}\x1E${d}`;
}

/** ref / echarts 实例用的短键，避免特殊字符问题 */
function comparableGroupSlug(modelName: string, datasetName: string): string {
  return `${modelName}|||${datasetName}`
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5_-]/g, '_');
}

/** 演示数据：补齐 modelName */
function withTaskMeta(
  row: ReturnType<typeof genMockTaskMetrics>,
  t: API.TaskItem,
): TaskMetricsData {
  return {
    ...row,
    modelName: t.modelName || '-',
    datasetName: t.datasetName || '-',
  };
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
  };
}

function placeholderTaskRow(id: string, hint?: API.TaskItem): API.TaskItem {
  return {
    id,
    name: `训练版本 ${String(id).slice(0, 8)}…`,
    createTime: '',
    status: 'pending',
    progress: 0,
    modelName: hint?.modelName || '-',
    datasetName: hint?.datasetName || '-',
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
            const list: API.TaskItem[] = vers.length
              ? vers.map((d) => experimentVersionToTaskRow(d))
              : [
                  experimentVersionToTaskRow({
                    id: `${expId}-v1`,
                    experimentId: expId,
                    versionNo: 1,
                    name: `实验 ${expId} · 第 1 版`,
                    status: 'success',
                  }),
                  experimentVersionToTaskRow({
                    id: `${expId}-v2`,
                    experimentId: expId,
                    versionNo: 2,
                    name: `实验 ${expId} · 第 2 版`,
                    status: 'success',
                  }),
                  experimentVersionToTaskRow({
                    id: `${expId}-v3`,
                    experimentId: expId,
                    versionNo: 3,
                    name: `实验 ${expId} · 第 3 版`,
                    status: 'success',
                  }),
                ];
            // 确保从详情页带入的所有版本 id 都可在对比页被选中
            const want = idsFromUrl;
            const missing = want.filter(
              (id) => !list.some((t) => String(t.id) === String(id)),
            );
            for (const id of missing) {
              list.unshift(
                placeholderTaskRow(
                  id,
                  list.find((t) => t.modelName && t.datasetName),
                ),
              );
            }
            setTaskList(
              await enrichTaskItemsWithDisplayNames(list, {
                skipErrorHandler: true,
              }),
            );
            return;
          } catch {
            const list: API.TaskItem[] = [
              experimentVersionToTaskRow({
                id: `${expId}-v1`,
                experimentId: expId,
                versionNo: 1,
                name: `实验 ${expId} · 第 1 版`,
                status: 'success',
              }),
              experimentVersionToTaskRow({
                id: `${expId}-v2`,
                experimentId: expId,
                versionNo: 2,
                name: `实验 ${expId} · 第 2 版`,
                status: 'success',
              }),
              experimentVersionToTaskRow({
                id: `${expId}-v3`,
                experimentId: expId,
                versionNo: 3,
                name: `实验 ${expId} · 第 3 版`,
                status: 'success',
              }),
            ];
            const want = idsFromUrl;
            const missing = want.filter(
              (id) => !list.some((t) => String(t.id) === String(id)),
            );
            for (const id of missing) {
              list.unshift(
                placeholderTaskRow(
                  id,
                  list.find((t) => t.modelName && t.datasetName),
                ),
              );
            }
            setTaskList(
              await enrichTaskItemsWithDisplayNames(list, {
                skipErrorHandler: true,
              }),
            );
            return;
          }
        }

        const res = await fetchTaskList({ current: 1, pageSize: 200 });
        let list = normalizeTaskListResponse(res);
        if (!list.length) list = [...MOCK_TASKS];

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
            // 后端不可用/超时时也要保证 URL 带入的 id 可被选中并展示演示对比
            list.unshift(placeholderTaskRow(id, hint));
          }
        }

        setTaskList(
          await enrichTaskItemsWithDisplayNames(list, {
            skipErrorHandler: true,
          }),
        );
      } catch {
        // 后端不可用/超时：仍要保证 URL 带入的 id 能展示并可对比
        const hint = MOCK_TASKS.find((t) => t.modelName && t.datasetName);
        const placeholders = idsFromUrl.map((id) =>
          placeholderTaskRow(id, hint),
        );
        setTaskList(
          await enrichTaskItemsWithDisplayNames(
            [...placeholders, ...MOCK_TASKS],
            {
              skipErrorHandler: true,
            },
          ),
        );
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

  /** 从任务详情带 ?ids= 进入：预选行并自动加载演示曲线（依赖 taskList 就绪） */
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
      const selectedTasks = taskList.filter((t) =>
        valid.includes(String(t.id)),
      );
      const demo = selectedTasks.map((t, i) =>
        withTaskMeta(genMockTaskMetrics(String(t.id), t.name, i), t),
      );
      setMetricsData(demo);
      message.success(`已从详情带入 ${demo.length} 条任务并加载演示曲线`);
    }
  }, [loading, taskList, idsFromUrl]);

  const loadCompareData = useCallback(async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择至少一个任务');
      return;
    }
    setMetricsLoading(true);
    try {
      const ids = selectedRowKeys as string[];
      const idSet = new Set(ids);
      const selectedTasks = taskList.filter((t) => idSet.has(String(t.id)));
      const details: TaskWithRunId[] = [];
      for (const id of ids) {
        try {
          const res = await fetchTaskDetail(id, { skipErrorHandler: true });
          const d = (res?.data || {}) as TaskWithRunId;
          d.runId = d.runId || (res?.data as any)?.run_id;
          details.push(d);
        } catch {
          // 详情失败也继续：后续会回退演示曲线
          details.push({ id } as TaskWithRunId);
        }
      }
      const byId = new Map(selectedTasks.map((t) => [String(t.id), t]));
      const withRunId = details.filter((d) => d.runId);
      if (withRunId.length === 0) {
        const base = selectedTasks.length
          ? selectedTasks
          : ids.map((id) =>
              placeholderTaskRow(
                id,
                taskList.find((t) => t.modelName && t.datasetName),
              ),
            );
        const demo = base.map((t, i) =>
          withTaskMeta(genMockTaskMetrics(String(t.id), t.name, i), t),
        );
        setMetricsData(demo);
        message.info('当前环境无法获取训练指标，已加载演示数据');
        setMetricsLoading(false);
        return;
      }
      if (withRunId.length < details.length) {
        message.info(
          `部分任务无 Run ID，已跳过；共 ${withRunId.length} 个任务拉取指标`,
        );
      }

      const results: TaskMetricsData[] = [];
      let idx = 0;
      for (const t of withRunId) {
        const meta = byId.get(String(t.id)) || t;
        try {
          const metrics = await fetchMlflowMetricsBulk(
            t.runId!,
            MLFLOW_METRIC_KEYS as unknown as string[],
          );
          results.push({
            taskId: t.id,
            taskName: t.name,
            modelName: meta.modelName || '-',
            datasetName: meta.datasetName || '-',
            runId: t.runId!,
            metrics,
          });
        } catch {
          results.push(
            withTaskMeta(
              genMockTaskMetrics(t.id, t.name, idx),
              meta as API.TaskItem,
            ),
          );
        }
        idx += 1;
      }
      setMetricsData(results);
    } catch (e: any) {
      const base =
        (selectedRowKeys as string[]).map((id) =>
          placeholderTaskRow(
            id,
            taskList.find((t) => t.modelName && t.datasetName),
          ),
        ) || [];
      const demo = base.map((t, i) =>
        withTaskMeta(genMockTaskMetrics(String(t.id), t.name, i), t),
      );
      setMetricsData(demo);
      message.info('接口超时，已回退为演示数据');
    } finally {
      setMetricsLoading(false);
    }
  }, [selectedRowKeys, taskList]);

  const loadDemoData = useCallback(() => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择至少一个任务');
      return;
    }
    const ids = selectedRowKeys as string[];
    const idSet = new Set(ids.map(String));
    const selectedTasks = taskList.filter((t) => idSet.has(String(t.id)));
    const base = selectedTasks.length
      ? selectedTasks
      : ids.map((id) =>
          placeholderTaskRow(
            id,
            taskList.find((t) => t.modelName && t.datasetName),
          ),
        );
    const demo = base.map((t, i) =>
      withTaskMeta(genMockTaskMetrics(String(t.id), t.name, i), t),
    );
    setMetricsData(demo);
    message.success(`已加载 ${demo.length} 个任务的演示数据`);
  }, [selectedRowKeys, taskList]);

  const comparisonRows = useMemo(() => {
    if (!metricsData.length) return [];
    const rows = metricsData.map((r) => {
      const acc = lastPoint(r.metrics.val_accuracy);
      const m50 = lastPoint(r.metrics.val_mAP50);
      const loss = lastPoint(r.metrics.train_loss);
      const score = acc?.value ?? 0;
      return {
        key: r.taskId,
        taskName: r.taskName,
        modelName: r.modelName,
        datasetName: r.datasetName,
        valAcc: acc?.value,
        valM50: m50?.value,
        trainLoss: loss?.value,
        bestStepAcc: acc?.step,
        score,
      };
    });
    const sorted = [...rows].sort((a, b) => (b.score || 0) - (a.score || 0));
    return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
  }, [metricsData]);

  const sameModelGroups = useMemo((): ComparableGroup[] => {
    const map = new Map<string, TaskMetricsData[]>();
    for (const r of metricsData) {
      const k = comparableGroupKey(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([, tasks]) => {
        const head = tasks[0]!;
        return {
          slug: comparableGroupSlug(head.modelName, head.datasetName),
          modelName: head.modelName,
          datasetName: head.datasetName,
          tasks,
        };
      });
  }, [metricsData]);

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
      chartInstances.current[metricKey]!.setOption({
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

  // 相同模型 + 相同数据集：原始指标曲线 + 相对起点提升率
  useEffect(() => {
    sameModelGroups.forEach((group) => {
      const { slug, tasks: list } = group;
      const rawKey = `same_raw_${slug}`;
      const impKey = `same_imp_${slug}`;
      const metric = sameModelMetric;
      const elRaw = sameModelRawRefs.current[rawKey];
      const elImp = sameModelImpRefs.current[impKey];
      if (!elRaw || !elImp) return;

      const seriesRaw = list
        .filter((t) => t.metrics[metric]?.length)
        .map((t, i) => ({
          name: t.taskName,
          type: 'line' as const,
          smooth: true,
          data: t.metrics[metric]!.map((p) => [p.step, p.value]),
          itemStyle: { color: TASK_COLORS[i % TASK_COLORS.length] },
        }));
      const seriesImp = list
        .filter((t) => t.metrics[metric]?.length)
        .map((t, i) => ({
          name: t.taskName,
          type: 'line' as const,
          smooth: true,
          data: toRelativeImprovement(t.metrics[metric]!).map((p) => [
            p.step,
            p.value,
          ]),
          itemStyle: { color: TASK_COLORS[i % TASK_COLORS.length] },
        }));

      if (!sameModelRawCharts.current[rawKey]) {
        sameModelRawCharts.current[rawKey] = echarts.init(elRaw);
      }
      if (!sameModelImpCharts.current[impKey]) {
        sameModelImpCharts.current[impKey] = echarts.init(elImp);
      }
      const label = METRIC_LABELS[metric] || metric;
      sameModelRawCharts.current[rawKey]!.setOption({
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          top: '12%',
          containLabel: true,
        },
        xAxis: { type: 'value', name: 'Step' },
        yAxis: { type: 'value', name: label },
        series: seriesRaw,
      });
      sameModelImpCharts.current[impKey]!.setOption({
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          top: '12%',
          containLabel: true,
        },
        xAxis: { type: 'value', name: 'Step' },
        yAxis: { type: 'value', name: '相对起点提升 (%)' },
        series: seriesImp,
      });
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
  }, [metricsData, sameModelGroups, sameModelMetric]);

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
      render: (v: number) =>
        v === 1 ? (
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
      title: '最终验证准确率',
      dataIndex: 'valAcc',
      key: 'valAcc',
      render: (v: number | undefined) => (v != null ? formatNum(v, 4) : '-'),
    },
    {
      title: '最终 mAP50',
      dataIndex: 'valM50',
      key: 'valM50',
      render: (v: number | undefined) => (v != null ? formatNum(v, 4) : '-'),
    },
    {
      title: '最终训练损失',
      dataIndex: 'trainLoss',
      key: 'trainLoss',
      render: (v: number | undefined) => (v != null ? formatNum(v, 4) : '-'),
    },
    {
      title: '准确率末值 Step',
      dataIndex: 'bestStepAcc',
      key: 'bestStepAcc',
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

  const metricSelectOptions = useMemo((): string[] => {
    const up = availableMetrics.filter(
      (k) => k.includes('accuracy') || k.includes('mAP'),
    );
    if (up.length > 0) return [...up];
    const nonLoss = availableMetrics.filter((k) => k !== 'train_loss');
    if (nonLoss.length > 0) return [...nonLoss];
    return [...availableMetrics];
  }, [availableMetrics]);

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
      subTitle="选择训练完成后的任务，对比模型终值指标、过程曲线；同一模型且同一数据集的多轮训练可查看性能提升曲线"
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
              const demo = `exp-demo-ui-${Date.now().toString(16).slice(-6)}`;
              setExperimentIdInput(demo);
              history.push(
                `/task/compare?experimentId=${encodeURIComponent(demo)}`,
              );
            }}
          >
            一键演示
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
          对比池只保存版本/训练的 ID（本地存储）。进入对比页时会自动补全这些 ID
          对应的行，并在后端不可用时回退为演示曲线。
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
              onClick={loadCompareData}
              loading={metricsLoading}
              disabled={selectedRowKeys.length === 0}
            >
              加载对比数据
            </Button>
            <Button
              onClick={loadDemoData}
              disabled={selectedRowKeys.length === 0}
            >
              使用演示数据
            </Button>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              已选 {selectedRowKeys.length} 个任务。性能提升曲线仅对「同一模型 +
              同一数据集」下 ≥2 条任务生效
            </span>
          </Space>
        </div>
      </Card>

      {metricsData.length > 0 && (
        <Card
          title="模型对比结果"
          style={{ marginBottom: 16 }}
          extra={
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              按验证准确率终值排序
            </span>
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

      {metricsData.length > 0 && sameModelGroups.length === 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ color: '#8c8c8c' }}>
            未形成「同一模型 + 同一数据集」且条数 ≥2
            的分组。请选多条模型与数据集均相同的任务（演示：三条 YOLOv8 +
            COCO；或两条 YOLOv8 + CIFAR-10）。
          </div>
        </Card>
      )}

      {metricsData.length > 0 && sameModelGroups.length > 0 && (
        <Card
          title="同模型同数据集 · 性能提升曲线"
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
            下列分组要求「模型名称」与「数据集名称」均一致，且至少 2
            条任务。左图为指标随 Step
            变化；右图为相对该次训练起点的提升幅度（%）。
          </div>
          {sameModelGroups.map((group) => {
            const { slug, modelName, datasetName } = group;
            const rawKey = `same_raw_${slug}`;
            const impKey = `same_imp_${slug}`;
            return (
              <div key={slug} style={{ marginBottom: 32 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>
                  模型：{modelName}
                  <span style={{ margin: '0 8px', color: '#d9d9d9' }}>|</span>
                  数据集：{datasetName}
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
                      （过程）
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
                      相对训练起点的提升率（%）
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
          提示：真实数据来自
          MLflow；演示数据用于本地预览。「性能提升」分组依据为任务中的模型名与数据集名均一致（与仅用模型名区分）。
        </div>
      )}
    </PageContainer>
  );
};

export default TaskCompare;

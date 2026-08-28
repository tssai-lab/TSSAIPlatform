/**
 * 训练后模型性能对比页
 * - 单值指标多维对照表
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
  Tooltip,
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
import { formatDisplayDateTime } from '@/utils/formatDateTime';
import { enrichTaskItemsWithDisplayNames } from '@/utils/taskDisplayNames';
import {
  isStepSeriesMetric,
  METRIC_LABELS as SHARED_METRIC_LABELS,
} from '@/utils/trainingMetrics';

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
  ...SHARED_METRIC_LABELS,
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

/** 版本展示：同名任务靠版本号区分 */
function formatVersionNo(versionNo?: number) {
  return versionNo != null ? `第 ${versionNo} 版` : '-';
}

/** 截断 ID，完整值放 title */
function shortId(id?: string, keep = 10) {
  if (!id) return '-';
  return id.length > keep ? `${id.slice(0, keep)}…` : id;
}

/** 曲线图例：名称 + 版本 + 短任务 ID，避免多条同名线无法辨认 */
function formatTaskSeriesName(
  task: Pick<TaskMetricsData, 'taskName' | 'versionNo' | 'taskId'>,
) {
  const parts = [task.taskName || '未命名'];
  if (task.versionNo != null) parts.push(`v${task.versionNo}`);
  parts.push(shortId(task.taskId, 8));
  return parts.join(' · ');
}

/** 性能提升图横轴短标签：优先版本 + 短 ID，名称过长时压缩 */
function formatImprovementAxisLabel(
  task: Pick<TaskMetricsData, 'taskName' | 'versionNo' | 'taskId'>,
) {
  const ver = task.versionNo != null ? `v${task.versionNo}` : null;
  const id = shortId(task.taskId, 8);
  const name = (task.taskName || '未命名').slice(0, 12);
  return [ver, id, name].filter(Boolean).join('\n');
}

/** 性能提升图 tooltip：数值优先，身份信息次要 */
function formatImprovementTooltipHtml(
  task: TaskMetricsData,
  valueLines: string[],
) {
  const identity = [
    task.versionNo != null ? `第 ${task.versionNo} 版` : null,
    shortId(task.taskId, 10),
    task.taskName || '未命名',
  ]
    .filter(Boolean)
    .join(' · ');
  const detail = [
    task.experimentId ? `训练 ${shortId(task.experimentId, 14)}` : null,
    task.createTime ? formatDisplayDateTime(task.createTime) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return [
    ...valueLines.map(
      (line) => `<div style="font-size:13px;font-weight:600">${line}</div>`,
    ),
    `<div style="margin-top:6px;opacity:.85">${identity}</div>`,
    detail
      ? `<div style="margin-top:2px;font-size:11px;opacity:.7">${detail}</div>`
      : null,
  ]
    .filter(Boolean)
    .join('');
}

/** 表格身份列：一行主名称 + 一行次要标识，悬停看完整信息 */
function TaskIdentityCell(props: {
  taskName?: string;
  versionNo?: number;
  experimentId?: string;
  taskId?: string;
  createTime?: string;
  modelName?: string;
  datasetName?: string;
}) {
  const {
    taskName,
    versionNo,
    experimentId,
    taskId,
    createTime,
    modelName,
    datasetName,
  } = props;
  const metaParts = [
    versionNo != null ? `v${versionNo}` : null,
    taskId ? shortId(taskId, 8) : null,
    createTime ? formatDisplayDateTime(createTime) : null,
  ].filter(Boolean);
  const tipLines = [
    taskName ? `名称：${taskName}` : null,
    versionNo != null ? `训练版本：第 ${versionNo} 版` : null,
    experimentId ? `训练编号：${experimentId}` : null,
    taskId ? `任务 ID：${taskId}` : null,
    createTime ? `创建时间：${formatDisplayDateTime(createTime)}` : null,
    modelName && modelName !== '-' ? `模型：${modelName}` : null,
    datasetName && datasetName !== '-' ? `数据集：${datasetName}` : null,
  ].filter(Boolean) as string[];
  const body = (
    <div style={{ lineHeight: 1.35 }}>
      <div style={{ fontWeight: 500 }}>{taskName || '未命名'}</div>
      {metaParts.length > 0 && (
        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          {metaParts.join(' · ')}
        </div>
      )}
    </div>
  );
  if (!tipLines.length) return body;
  return (
    <Tooltip
      title={
        <div style={{ whiteSpace: 'pre-line' }}>{tipLines.join('\n')}</div>
      }
    >
      {body}
    </Tooltip>
  );
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

/** 复用或重建 echarts 实例（DOM 换了 / 已 dispose 则重建） */
function ensureEcharts(
  store: React.MutableRefObject<Record<string, echarts.ECharts | null>>,
  key: string,
  el: HTMLDivElement,
): echarts.ECharts {
  const prev = store.current[key];
  if (prev && !prev.isDisposed() && prev.getDom() === el) {
    return prev;
  }
  if (prev && !prev.isDisposed()) {
    prev.dispose();
  }
  const chart = echarts.init(el);
  store.current[key] = chart;
  return chart;
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
      message.warning('请输入训练编号');
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
          message.warning('所选任务没有可用的训练指标');
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

  /** 单值/常数指标：用于多指标统一对照表 */
  const finalTableMetricKeys = useMemo(
    () =>
      MLFLOW_METRIC_KEYS.filter((key) =>
        metricsData.some((task) => {
          const pts = task.metrics[key];
          return (pts?.length ?? 0) > 0 && !isStepSeriesMetric(pts);
        }),
      ),
    [metricsData],
  );

  const finalTableBestByMetric = useMemo(() => {
    const best = new Map<string, number>();
    for (const key of finalTableMetricKeys) {
      const values = metricsData
        .map((task) => lastPoint(task.metrics[key])?.value)
        .filter((v): v is number => v != null && Number.isFinite(v));
      if (!values.length) continue;
      best.set(
        key,
        isLowerBetter(key) ? Math.min(...values) : Math.max(...values),
      );
    }
    return best;
  }, [metricsData, finalTableMetricKeys]);

  const finalTableRows = useMemo(
    () =>
      metricsData.map((task) => {
        const row: Record<string, string | number | undefined> = {
          key: task.taskId,
          taskId: task.taskId,
          taskName: task.taskName,
          versionNo: task.versionNo,
          experimentId: task.experimentId,
          createTime: task.createTime,
          modelName: task.modelName,
          datasetName: task.datasetName,
        };
        for (const key of finalTableMetricKeys) {
          row[key] = lastPoint(task.metrics[key])?.value;
        }
        return row;
      }),
    [metricsData, finalTableMetricKeys],
  );

  const finalTableColumns: ColumnType<
    Record<string, string | number | undefined>
  >[] = useMemo(() => {
    const base: ColumnType<Record<string, string | number | undefined>>[] = [
      {
        title: '任务',
        key: 'taskIdentity',
        fixed: 'left',
        width: 220,
        render: (_, row) => (
          <TaskIdentityCell
            taskName={row.taskName as string | undefined}
            versionNo={row.versionNo as number | undefined}
            experimentId={row.experimentId as string | undefined}
            taskId={row.taskId as string | undefined}
            createTime={row.createTime as string | undefined}
            modelName={row.modelName as string | undefined}
            datasetName={row.datasetName as string | undefined}
          />
        ),
      },
    ];
    const metricCols: ColumnType<
      Record<string, string | number | undefined>
    >[] = finalTableMetricKeys.map((key) => ({
      title: METRIC_LABELS[key] || key,
      dataIndex: key,
      key,
      width: 130,
      render: (v: number | undefined) => {
        if (v == null || !Number.isFinite(v)) return '-';
        const best = finalTableBestByMetric.get(key);
        const isBest = best != null && v === best;
        return (
          <span
            style={{
              fontWeight: isBest ? 600 : 400,
              color: isBest ? '#1677ff' : undefined,
            }}
          >
            {formatNum(v, 4)}
            {isBest ? ' ★' : ''}
          </span>
        );
      },
    }));
    return [...base, ...metricCols];
  }, [finalTableMetricKeys, finalTableBestByMetric]);

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

  // 多任务过程曲线（仅多 step 序列）
  useEffect(() => {
    if (metricsData.length === 0 || selectedMetrics.length === 0) return;
    const metricsToShow = selectedMetrics.filter((m) =>
      metricsData.some((t) => isStepSeriesMetric(t.metrics[m])),
    );
    if (metricsToShow.length === 0) return;

    let cancelled = false;
    const observers: ResizeObserver[] = [];

    const paint = () => {
      if (cancelled) return;
      metricsToShow.forEach((metricKey) => {
        const el = chartRefs.current[metricKey];
        if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
        const series = metricsData
          .filter((t) => isStepSeriesMetric(t.metrics[metricKey]))
          .map((t, i) => ({
            name: formatTaskSeriesName(t),
            type: 'line' as const,
            smooth: true,
            data: t.metrics[metricKey].map((p) => [p.step, p.value]),
            itemStyle: { color: TASK_COLORS[i % TASK_COLORS.length] },
          }));
        if (series.length === 0) return;
        const chart = ensureEcharts(chartInstances, metricKey, el);
        chart.setOption({
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
        chart.resize();
      });
    };

    // 监听容器尺寸：父级布局晚于 effect 时避免空白；后续 resize 也能跟上
    metricsToShow.forEach((metricKey) => {
      const el = chartRefs.current[metricKey];
      if (!el || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => {
        paint();
      });
      ro.observe(el);
      observers.push(ro);
    });

    // 双 rAF + 短延迟：等 Card/布局完成后再 init
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(paint);
    });
    const retryTimer = window.setTimeout(paint, 80);

    const onWinResize = () => {
      metricsToShow.forEach((k) => {
        const chart = chartInstances.current[k];
        if (chart && !chart.isDisposed()) chart.resize();
      });
    };
    window.addEventListener('resize', onWinResize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      window.clearTimeout(retryTimer);
      observers.forEach((o) => {
        o.disconnect();
      });
      window.removeEventListener('resize', onWinResize);
      metricsToShow.forEach((k) => {
        chartInstances.current[k]?.dispose();
        chartInstances.current[k] = null;
      });
    };
  }, [metricsData, selectedMetrics]);

  // 相同模型 + 相同数据集：各版本最终指标 + 相对首版提升率
  useEffect(() => {
    let cancelled = false;
    const observers: ResizeObserver[] = [];

    const paint = () => {
      if (cancelled) return;
      displayedSameModelGroups.forEach((group) => {
        const { slug, tasks: list } = group;
        const rawKey = `same_raw_${slug}`;
        const impKey = `same_imp_${slug}`;
        const metric = sameModelMetric;
        const elRaw = sameModelRawRefs.current[rawKey];
        const elImp = sameModelImpRefs.current[impKey];
        if (!elRaw || !elImp) return;
        if (
          elRaw.clientWidth === 0 ||
          elRaw.clientHeight === 0 ||
          elImp.clientWidth === 0 ||
          elImp.clientHeight === 0
        ) {
          return;
        }

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
          formatImprovementAxisLabel(task),
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

        const rawChart = ensureEcharts(sameModelRawCharts, rawKey, elRaw);
        const impChart = ensureEcharts(sameModelImpCharts, impKey, elImp);
        const label = METRIC_LABELS[metric] || metric;
        const metricName = METRIC_LABELS[metric] || metric;
        rawChart.setOption(
          {
            tooltip: {
              trigger: 'axis',
              formatter: (params: unknown) => {
                const list = Array.isArray(params) ? params : [params];
                const first = list[0] as {
                  dataIndex?: number;
                  value?: unknown;
                };
                const idx = first?.dataIndex ?? 0;
                const item = points[idx];
                if (!item) return '';
                const val =
                  typeof first?.value === 'number'
                    ? formatNum(first.value, 4)
                    : String(first?.value ?? '-');
                return formatImprovementTooltipHtml(item.task, [
                  `${metricName}：${val}`,
                ]);
              },
            },
            grid: {
              left: '3%',
              right: '4%',
              bottom: '28%',
              top: '12%',
              containLabel: true,
            },
            xAxis: {
              type: 'category',
              data: labels,
              axisLabel: {
                interval: 0,
                rotate: labels.length > 3 ? 20 : 0,
                lineHeight: 14,
                fontSize: 11,
              },
            },
            yAxis: { type: 'value', name: label },
            series: seriesRaw,
          },
          true,
        );
        impChart.setOption(
          {
            tooltip: {
              trigger: 'axis',
              formatter: (params: unknown) => {
                const list = Array.isArray(params) ? params : [params];
                const first = list[0] as {
                  dataIndex?: number;
                  value?: unknown;
                };
                const idx = first?.dataIndex ?? 0;
                const item = points[idx];
                if (!item) return '';
                const raw =
                  typeof first?.value === 'number'
                    ? first.value
                    : Number(first?.value);
                const val = Number.isFinite(raw)
                  ? `${formatNum(raw, 2)}%`
                  : '-';
                return formatImprovementTooltipHtml(item.task, [
                  `相对首版提升：${val}`,
                ]);
              },
            },
            grid: {
              left: '3%',
              right: '4%',
              bottom: '28%',
              top: '12%',
              containLabel: true,
            },
            xAxis: {
              type: 'category',
              data: labels,
              axisLabel: {
                interval: 0,
                rotate: labels.length > 3 ? 20 : 0,
                lineHeight: 14,
                fontSize: 11,
              },
            },
            yAxis: { type: 'value', name: '相对首版提升 (%)' },
            series: seriesImp,
          },
          true,
        );
        rawChart.resize();
        impChart.resize();
      });
    };

    displayedSameModelGroups.forEach((group) => {
      const rawKey = `same_raw_${group.slug}`;
      const impKey = `same_imp_${group.slug}`;
      [
        sameModelRawRefs.current[rawKey],
        sameModelImpRefs.current[impKey],
      ].forEach((el) => {
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => {
          paint();
        });
        ro.observe(el);
        observers.push(ro);
      });
    });

    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(paint);
    });
    const retryTimer = window.setTimeout(paint, 80);

    const onWinResize = () => {
      Object.values(sameModelRawCharts.current).forEach((c) => {
        if (c && !c.isDisposed()) c.resize();
      });
      Object.values(sameModelImpCharts.current).forEach((c) => {
        if (c && !c.isDisposed()) c.resize();
      });
    };
    window.addEventListener('resize', onWinResize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      window.clearTimeout(retryTimer);
      observers.forEach((o) => {
        o.disconnect();
      });
      window.removeEventListener('resize', onWinResize);
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
    {
      title: '训练版本',
      dataIndex: 'versionNo',
      key: 'versionNo',
      width: 96,
      render: (v: number | undefined) => formatVersionNo(v),
    },
    {
      title: '训练编号',
      dataIndex: 'experimentId',
      key: 'experimentId',
      width: 120,
      ellipsis: true,
      render: (v: string | undefined) =>
        v ? <span title={v}>{shortId(v, 12)}</span> : '-',
    },
    { title: '模型', dataIndex: 'modelName', key: 'modelName' },
    { title: '数据集', dataIndex: 'datasetName', key: 'datasetName' },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (v: string | undefined) => formatDisplayDateTime(v),
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

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  /** 终值表可用（含单点标量） */
  const comparableMetrics = MLFLOW_METRIC_KEYS.filter(
    (key) =>
      metricsData.filter((task) => task.metrics[key]?.length).length >= 2,
  );

  /** 过程曲线可用：至少一条任务对该指标有多 step 序列 */
  const processSeriesMetrics = MLFLOW_METRIC_KEYS.filter((key) =>
    metricsData.some((task) => isStepSeriesMetric(task.metrics[key])),
  );

  const sameModelComparableMetrics = comparableMetrics.filter((key) =>
    sameModelGroups.some(
      (group) =>
        group.tasks.filter((task) => task.metrics[key]?.length).length >= 2,
    ),
  );

  useEffect(() => {
    if (!processSeriesMetrics.length) {
      setSelectedMetrics([]);
      return;
    }
    setSelectedMetrics((current) => {
      const valid = current.filter((key) =>
        processSeriesMetrics.some((available) => available === key),
      );
      const next = Array.from(
        new Set([...valid, ...processSeriesMetrics]),
      ).slice(0, Math.min(2, processSeriesMetrics.length));
      return next.join(',') === current.join(',') ? current : next;
    });
  }, [processSeriesMetrics.join(',')]);

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
      subTitle="选择训练记录和指标，查看数值、曲线及性能变化"
      onBack={() => history.push('/task/list')}
      extra={
        <Button onClick={() => history.push('/task/list')}>返回列表</Button>
      }
    >
      <Card title="按训练编号加载版本（高级）" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            value={experimentIdInput}
            onChange={(e) => setExperimentIdInput(e.target.value)}
            placeholder="输入训练编号"
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
          任务列表默认显示每次训练的最新版本；需要查看历史版本时，可输入训练编号加载。
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
          对比池只在当前浏览器保存所选记录编号，并加载对应的真实训练指标。
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
              个任务。性能提升曲线适用于同一训练的不同版本，或使用相同模型和数据集的至少两条记录。
            </span>
          </Space>
        </div>
      </Card>

      {metricsData.length > 0 && (
        <Card
          title="单值指标多维对照"
          style={{ marginBottom: 16 }}
          extra={
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              仅单点/常数指标；悬停「任务」列可看完整标识；★ 为该列最优（loss
              越低越好）
            </span>
          }
        >
          {finalTableMetricKeys.length > 0 ? (
            <Table
              rowKey="key"
              size="small"
              pagination={false}
              scroll={{
                x: Math.max(480, 240 + finalTableMetricKeys.length * 130),
              }}
              columns={finalTableColumns}
              dataSource={finalTableRows}
            />
          ) : (
            <div style={{ color: '#8c8c8c' }}>
              当前所选任务没有单值/常数类指标（或均为多 Step
              过程序列）。过程指标请看下方曲线。
            </div>
          )}
        </Card>
      )}

      {metricsData.length > 0 && displayedSameModelGroups.length === 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ color: '#8c8c8c' }}>
            未形成可比较的版本组。请选择同一训练的不同版本，或使用相同模型和数据集的多条训练记录。
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
            左图比较各版本训练结束时的指标；右图展示相对首个版本的提升幅度。损失值下降计为提升；首版指标为
            0 时不计算百分比。
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
                        sameModelImpRefs.current[impKey] = el;
                      }}
                      style={{ height: 300, width: '100%' }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: '#8c8c8c',
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  横轴点对应任务（悬停数据点可看完整 ID）：
                  {group.tasks.map((task, idx) => (
                    <span key={task.taskId} style={{ marginRight: 12 }}>
                      {idx + 1}. {formatTaskSeriesName(task)}
                    </span>
                  ))}
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
              仅多 Step 序列；单值/常数请看上方「单值指标多维对照」
            </span>
          }
        >
          {processSeriesMetrics.length > 0 ? (
            <Checkbox.Group
              value={selectedMetrics}
              onChange={(vals) => setSelectedMetrics(vals as string[])}
              options={processSeriesMetrics.map((k) => ({
                label: METRIC_LABELS[k] || k,
                value: k,
              }))}
            />
          ) : (
            <div style={{ color: '#8c8c8c' }}>
              暂无多 Step
              过程序列。若指标仅为终值单点，请使用上方「单值指标多维对照」或「性能提升曲线」。
            </div>
          )}
        </Card>
      )}

      {metricsData.length > 0 &&
        processSeriesMetrics.length > 0 &&
        selectedMetrics.length > 0 && (
          <Card title="过程曲线图">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {selectedMetrics.map((metricKey) => {
                const hasData = metricsData.some((t) =>
                  isStepSeriesMetric(t.metrics[metricKey]),
                );
                if (!hasData) return null;
                return (
                  <div key={metricKey}>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>
                      {METRIC_LABELS[metricKey] || metricKey}
                    </div>
                    <div
                      ref={(el) => {
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
          “性能提升”适用于同一训练的不同版本，或使用相同模型和数据集的训练记录。
        </div>
      )}
    </PageContainer>
  );
};

export default TaskCompare;

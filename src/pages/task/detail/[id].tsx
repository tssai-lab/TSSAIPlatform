/**
 * 训练结果详情页 - Page 层
 * 任务信息、训练指标可视化（从 MLflow 获取）、结果文件列表
 * @see MLflow训练指标对接说明.md
 */

import { MoreOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useParams, useSearchParams } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Dropdown,
  Form,
  Input,
  List,
  Modal,
  message,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TrainingMetricsPanel from '@/components/TrainingMetricsPanel';
import { MOCK_TASK_DETAIL } from '@/constants/mockData';
import {
  downloadObject,
  fetchTaskDetail,
  getExperimentVersion,
  listExperimentVersions,
  triggerBlobDownload,
  updateExperimentHyperParams,
} from '@/services/platform';
import {
  getDatasetVersionDisplayLabel,
  getModelVersionDisplayLabel,
  preloadDatasetVersionDisplayNames,
  preloadTaskVersionDisplayNames,
} from '@/utils/taskDisplayNames';
import {
  isActiveTaskStatus,
  TASK_STATUS_POLL_INTERVAL_MS,
} from '@/utils/trainingMetrics';

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

/** 任务详情扩展类型 */
type TaskDetailInfo = API.TaskItem & {
  completeTime?: string;
  duration?: string;
  metrics?: Record<string, any>;
  files?: { name: string; desc: string; objectName?: string }[];
  hyperParams?: Record<string, any>;
  codeVersionId?: string;
  trainingProfile?: string;
};

function _shortId(v?: string, keep = 10) {
  if (!v) return '-';
  if (v.length <= keep) return v;
  return `${v.slice(0, keep)}…`;
}

function renderHyperParamsCell(hp: any) {
  const epochs = hp?.epochs ?? hp?.num_epochs;
  const batch = hp?.batch_size ?? hp?.batch;
  const lr = hp?.learning_rate ?? hp?.lr0;
  const txt = `epochs=${epochs ?? '-'}，batch=${batch ?? '-'}，lr=${lr ?? '-'}`;
  return (
    <Tooltip title={JSON.stringify(hp ?? {}, null, 2)}>
      <span>{txt}</span>
    </Tooltip>
  );
}

function saveContinueTrainingPrefill(record: API.TrainingExperimentVersion) {
  localStorage.setItem(
    'taskCreatePrefill',
    JSON.stringify({
      modelVersionId: record.modelVersionId,
      datasetVersionId: record.datasetVersionId,
      codeVersionId: record.codeVersionId,
      hyperParams: JSON.stringify(record.hyperParams ?? {}, null, 2),
      remark: record.remark
        ? `基于 v${record.versionNo}：${record.remark}`
        : `基于 v${record.versionNo} 继续训练`,
    }),
  );
}

function statusText(status?: string) {
  const map: Record<string, string> = {
    pending: '待执行',
    queued: '排队中',
    running: '运行中',
    success: '成功',
    failed: '失败',
    stopped: '已停止',
  };
  return status ? map[status] || status : '-';
}

function statusColor(status?: string) {
  if (status === 'success') return 'success';
  if (status === 'running') return 'processing';
  if (status === 'queued') return 'warning';
  if (status === 'failed') return 'error';
  return 'default';
}

function isExperimentId(value?: string) {
  return !!value && /^exp-/i.test(value);
}

function mapVersionToTaskDetail(
  data: API.TrainingExperimentVersion,
): TaskDetailInfo {
  return {
    ...data,
    createTime: data.createTime || data.createdAt || '',
    runId: data.runId || (data as any).run_id,
  };
}

const CONSISTENCY_PROFILE = 'image_text_consistency_fusion_logreg';

const CONSISTENCY_SPLITS = ['train', 'val', 'test'] as const;

const CONSISTENCY_METRIC_KEYS = [
  'accuracy',
  'precision',
  'recall',
  'f1',
  'roc_auc',
] as const;

const CONSISTENCY_ARTIFACT_FILES = [
  'fusion_model.pkl',
  'metrics.json',
  'val_predictions.csv',
  'test_predictions.csv',
] as const;

function isConsistencyProfileTask(metrics?: Record<string, any>) {
  return metrics?.trainingProfile === CONSISTENCY_PROFILE;
}

function formatMetricValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(4);
  }
  return value != null && value !== '' ? String(value) : '-';
}

function buildConsistencyMetricsRows(metrics?: Record<string, any>) {
  if (!metrics) return [];
  return CONSISTENCY_SPLITS.map((split) => {
    const label =
      split === 'train' ? '训练集' : split === 'val' ? '验证集' : '测试集';
    const row: Record<string, string | number> = {
      key: split,
      split: label,
      rows: metrics[`${split}_rows`] ?? '-',
      positive: metrics[`${split}_positive`] ?? '-',
      negative: metrics[`${split}_negative`] ?? '-',
    };
    CONSISTENCY_METRIC_KEYS.forEach((metric) => {
      row[metric] = formatMetricValue(metrics[`${split}_${metric}`]);
    });
    return row;
  });
}

function buildConsistencyArtifactItems(outputPath?: string, logPath?: string) {
  const items: {
    name: string;
    desc: string;
    objectName?: string;
  }[] = [];
  if (outputPath) {
    const base = minioPathToObjectName(outputPath);
    CONSISTENCY_ARTIFACT_FILES.forEach((fileName) => {
      if (!base) return;
      items.push({
        name: fileName,
        desc: `minio://${base}/${fileName}`,
        objectName: `${base}/${fileName}`,
      });
    });
  }
  if (logPath) {
    const logObj = logPath.replace(/^minio:\/\//, '').replace(/\/$/, '');
    items.push({ name: 'train.log', desc: logPath, objectName: logObj });
  }
  return items;
}

function minioPathToObjectName(path?: string): string | undefined {
  if (!path) return undefined;
  // Worker stores artifacts under the full key training-results/<id>/artifacts/<file>
  // in the default MinIO bucket, so only strip the minio:// scheme (not path segments).
  const normalized = path.replace(/^minio:\/\//, '').replace(/\/$/, '');
  const parts = normalized.split('/');
  // Be tolerant of minio://<bucket>/training-results/... style paths.
  if (parts.length > 1 && parts[1] === 'training-results') {
    return parts.slice(1).join('/');
  }
  return normalized;
}

function isLikelyDirectoryPath(path?: string) {
  if (!path) return false;
  const normalized = path.replace(/^minio:\/\//, '');
  if (normalized.endsWith('/')) return true;
  const basename = normalized.split('/').pop() || '';
  return !basename.includes('.');
}

async function errorMessageFromDownloadError(error: any) {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const json = JSON.parse(text);
      return json?.errorMessage || json?.message || text;
    } catch {
      return '文件不存在或下载失败';
    }
  }
  return (
    error?.response?.data?.errorMessage ||
    error?.response?.data?.message ||
    error?.message ||
    '文件不存在或下载失败'
  );
}

const TaskDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const versionNoParam = searchParams.get('versionNo');
  const [taskInfo, setTaskInfo] = useState<TaskDetailInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [runIdInput, setRunIdInput] = useState('');
  const [manualRunId, setManualRunId] = useState('');
  const [taskLastUpdatedAt, setTaskLastUpdatedAt] = useState('');
  const [versions, setVersions] = useState<API.TrainingExperimentVersion[]>([]);
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkModalLoading, setRemarkModalLoading] = useState(false);
  const [remarkBase, setRemarkBase] =
    useState<API.TrainingExperimentVersion | null>(null);
  const [remarkForm] = Form.useForm();
  /** 同一实验下多版本对比：勾选版本记录 id */
  const [compareVersionKeys, setCompareVersionKeys] = useState<React.Key[]>([]);
  const [, setDisplayNamesReady] = useState(0);

  const runId = taskInfo?.runId || manualRunId;
  const experimentId = taskInfo?.experimentId;

  const loadTaskDetail = useCallback(
    async (showLoading = false) => {
      if (!id) return;
      if (showLoading) {
        setLoading(true);
      }
      try {
        const parsedVersionNo = versionNoParam ? Number(versionNoParam) : NaN;
        let data: TaskDetailInfo | null = null;

        if (
          isExperimentId(id) &&
          Number.isFinite(parsedVersionNo) &&
          parsedVersionNo > 0
        ) {
          const res = await getExperimentVersion(id, parsedVersionNo, {
            skipErrorHandler: true,
          });
          if (res?.data) {
            data = mapVersionToTaskDetail(res.data);
          }
        } else {
          const res = await fetchTaskDetail(id, { skipErrorHandler: true });
          if (res?.data) {
            data = res.data as TaskDetailInfo;
            data.runId = data.runId || (res.data as any).run_id;
          }
        }

        if (data) {
          setTaskInfo(data);
          await preloadTaskVersionDisplayNames(
            data.modelVersionId,
            data.datasetVersionId,
            { skipErrorHandler: true },
          );
          setDisplayNamesReady((t) => t + 1);
        } else {
          setTaskInfo(MOCK_TASK_DETAIL as TaskDetailInfo);
        }
        setTaskLastUpdatedAt(new Date().toLocaleTimeString());
      } catch {
        setTaskInfo(MOCK_TASK_DETAIL as TaskDetailInfo);
        setTaskLastUpdatedAt(new Date().toLocaleTimeString());
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [id, versionNoParam],
  );

  useEffect(() => {
    loadTaskDetail(true);
  }, [loadTaskDetail]);

  useEffect(() => {
    if (loading || !experimentId) return;
    if (window.location.hash === '#version-history') {
      window.requestAnimationFrame(() => {
        document
          .getElementById('version-history')
          ?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, [loading, experimentId]);

  useEffect(() => {
    if (!id || !isActiveTaskStatus(taskInfo?.status)) return;
    const timer = window.setInterval(() => {
      loadTaskDetail(false);
    }, TASK_STATUS_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [id, loadTaskDetail, taskInfo?.status]);

  useEffect(() => {
    if (!experimentId) {
      setVersions([]);
      return;
    }
    listExperimentVersions(experimentId, { skipErrorHandler: true })
      .then(async (res: any) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        setVersions(list);
        await preloadDatasetVersionDisplayNames(
          list.map(
            (item: API.TrainingExperimentVersion) => item.datasetVersionId,
          ),
          { skipErrorHandler: true },
        );
        setDisplayNamesReady((t) => t + 1);
      })
      .catch(() => setVersions([]));
  }, [experimentId]);

  const refreshVersions = async (expId: string) => {
    try {
      const res: any = await listExperimentVersions(expId, {
        skipErrorHandler: true,
      });
      setVersions(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setVersions([]);
    }
  };

  const handleContinueSameExperiment = (
    record?: API.TrainingExperimentVersion,
  ) => {
    if (!experimentId) {
      message.warning('缺少 experimentId');
      return;
    }
    const base =
      record ||
      versions.find((v) => v.id === taskInfo?.id) ||
      versions[versions.length - 1];
    if (!base) {
      message.warning('暂无可用版本配置');
      return;
    }
    saveContinueTrainingPrefill(base);
    history.push(
      `/task/create?experimentId=${encodeURIComponent(experimentId)}`,
    );
  };

  const handleTraceVersion = (versionRecordId: string) => {
    const target = versions.find((v) => v.id === versionRecordId);
    if (!target) return;
    history.push(`/task/detail/${encodeURIComponent(target.id)}`);
  };

  const handleJumpToLatestVersion = () => {
    if (!experimentId) return;
    const latest = versions[versions.length - 1];
    if (latest) {
      history.push(`/task/detail/${encodeURIComponent(latest.id)}`);
      return;
    }
    history.push(`/task/detail/${encodeURIComponent(experimentId)}`);
  };

  const openUpdateRemark = (record: API.TrainingExperimentVersion) => {
    setRemarkBase(record);
    remarkForm.setFieldsValue({
      remark: record.remark || '',
    });
    setRemarkModalOpen(true);
  };

  const submitRemarkModal = async () => {
    const expId = experimentId || remarkBase?.experimentId;
    if (!expId || !remarkBase) {
      message.warning('缺少 experimentId，无法操作');
      return;
    }
    try {
      const values = await remarkForm.validateFields();
      setRemarkModalLoading(true);
      await updateExperimentHyperParams(
        expId,
        remarkBase.versionNo,
        { hyperParams: remarkBase.hyperParams, remark: values.remark },
        { skipErrorHandler: true },
      );
      message.success('已更新备注');
      setRemarkModalOpen(false);
      setRemarkBase(null);
      remarkForm.resetFields();
      await refreshVersions(expId);
      await loadTaskDetail(false);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.errorMessage || e?.message || '操作失败，请重试');
    } finally {
      setRemarkModalLoading(false);
    }
  };

  useEffect(() => {
    if (!versions.length) {
      setCompareVersionKeys([]);
      return;
    }
    if (versions.length >= 2) {
      const first = versions[0];
      const last = versions[versions.length - 1];
      if (first && last) {
        setCompareVersionKeys([first.id, last.id]);
      }
      return;
    }
    const one = versions[0];
    if (one) {
      setCompareVersionKeys([one.id]);
    }
  }, [versions, taskInfo?.id]);

  if (loading) {
    return (
      <PageContainer
        title="训练结果详情"
        onBack={() => history.push('/task/list')}
      >
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  if (!taskInfo) return null;

  const latestVersion = versions.length
    ? versions[versions.length - 1]
    : undefined;
  const viewingVersionNo = (taskInfo as any).versionNo as number | undefined;
  const isTracingHistorical =
    !!latestVersion && !!taskInfo.id && latestVersion.id !== taskInfo.id;
  const tracedVersionRecord =
    versions.find((v) => v.id === taskInfo.id) ||
    versions.find((v) => v.versionNo === viewingVersionNo);

  const compareVersionColumns: ColumnsType<API.TrainingExperimentVersion> = [
    {
      title: '版本',
      dataIndex: 'versionNo',
      width: 70,
      render: (v, record) => (
        <Space>
          {`第 ${v} 版`}
          {record.id === taskInfo.id ? <Tag color="blue">当前</Tag> : null}
        </Space>
      ),
    },
    {
      title: '代码模型版本',
      dataIndex: 'codeVersionId',
      ellipsis: true,
      render: (v: any) => (
        <Tooltip title={v || ''}>
          <span>{v || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: '数据集版本',
      dataIndex: 'datasetVersionId',
      ellipsis: true,
      render: (v: any) => (
        <Tooltip title={v || ''}>
          <span>
            {getDatasetVersionDisplayLabel(v ? String(v) : undefined)}
          </span>
        </Tooltip>
      ),
    },
    {
      title: '超参数',
      dataIndex: 'hyperParams',
      ellipsis: true,
      render: (hp: any) => renderHyperParamsCell(hp),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 140,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    { title: '时间', dataIndex: 'createdAt', width: 180 },
  ];

  const handleCompareVersions = () => {
    if (compareVersionKeys.length < 2) {
      message.warning('请至少选择 2 个版本进行对比');
      return;
    }
    const qs = new URLSearchParams();
    if (experimentId) qs.set('experimentId', String(experimentId));
    qs.set('ids', (compareVersionKeys as string[]).join(','));
    history.push(`/task/compare?${qs.toString()}`);
  };

  return (
    <PageContainer
      title="训练结果详情"
      subTitle="按 experimentId 追溯各次训练：代码模型版本、数据集版本与超参数为只读快照"
      onBack={() => history.push('/task/list')}
      extra={
        <Space wrap>
          {experimentId && versions.length > 0 && (
            <Space size={8}>
              <Typography.Text type="secondary">追溯版本</Typography.Text>
              <Select
                style={{ minWidth: 160 }}
                value={taskInfo.id}
                options={versions.map((v) => ({
                  value: v.id,
                  label: `v${v.versionNo}${v.id === latestVersion?.id ? '（最新）' : ''}`,
                }))}
                onChange={handleTraceVersion}
              />
            </Space>
          )}
          {experimentId && (
            <Button
              type="primary"
              onClick={() => handleContinueSameExperiment(tracedVersionRecord)}
            >
              基于此版本继续训练
            </Button>
          )}
          {isTracingHistorical && (
            <Button onClick={handleJumpToLatestVersion}>回到最新版本</Button>
          )}
          <Button onClick={() => history.push('/task/list')}>返回列表</Button>
        </Space>
      }
    >
      {isTracingHistorical && viewingVersionNo != null && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`正在追溯历史版本 v${viewingVersionNo}`}
          description={
            <>
              下方展示的是该次训练提交时的配置快照（代码模型版本、数据集版本、超参数），不会被修改。
              {latestVersion ? (
                <> 该实验最新版本为 v{latestVersion.versionNo}。</>
              ) : null}
            </>
          }
        />
      )}

      {experimentId &&
        versions.length > 1 &&
        !isTracingHistorical &&
        viewingVersionNo != null && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`当前为最新版本 v${viewingVersionNo}`}
            description="可在右上角「追溯版本」下拉框切换到历史版本，查看各次训练的配置对应关系。"
          />
        )}

      <Card title="任务信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="任务名称">
            <strong>{taskInfo.name}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="实验ID">
            <Space>
              <span style={{ fontFamily: 'monospace' }}>
                {experimentId || '-'}
              </span>
              {experimentId && (
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    navigator.clipboard?.writeText(experimentId);
                    message.success('已复制 experimentId');
                  }}
                >
                  复制
                </Button>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="版本号">
            <Space>
              <Tag color="blue">v{viewingVersionNo ?? '-'}</Tag>
              {isTracingHistorical && <Tag>历史追溯</Tag>}
              {latestVersion?.id === taskInfo.id && (
                <Tag color="green">最新</Tag>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="模型版本">
            <Tooltip title={taskInfo.modelVersionId || ''}>
              {getModelVersionDisplayLabel(taskInfo.modelVersionId)}
            </Tooltip>
          </Descriptions.Item>
          <Descriptions.Item label="数据集版本">
            <Tooltip title={taskInfo.datasetVersionId || ''}>
              {getDatasetVersionDisplayLabel(taskInfo.datasetVersionId)}
            </Tooltip>
          </Descriptions.Item>
          <Descriptions.Item label="代码模型版本标识" span={2}>
            {(taskInfo as TaskDetailInfo).codeVersionId || '-'}
          </Descriptions.Item>
          {(taskInfo as TaskDetailInfo).trainingProfile && (
            <Descriptions.Item label="训练方案" span={2}>
              图文一致性基线训练
              <Typography.Text
                type="secondary"
                style={{ marginLeft: 8, fontSize: 12 }}
              >
                （内部 ID：
                <code>{(taskInfo as TaskDetailInfo).trainingProfile}</code>）
              </Typography.Text>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="该版本超参数" span={2}>
            {renderHyperParamsCell((taskInfo as TaskDetailInfo).hyperParams)}
          </Descriptions.Item>
          {(taskInfo as TaskDetailInfo).hyperParams && (
            <Descriptions.Item label="超参数完整 JSON" span={2}>
              <Typography.Paragraph
                copyable
                style={{
                  margin: 0,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(
                  (taskInfo as TaskDetailInfo).hyperParams,
                  null,
                  2,
                )}
              </Typography.Paragraph>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="创建时间">
            {taskInfo.createTime || (taskInfo as any).createdAt || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="完成时间">
            {taskInfo.completeTime || taskInfo.finishedAt || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Space size={8}>
              <Tag color={statusColor(taskInfo.status)}>
                {statusText(taskInfo.status)}
              </Tag>
              {isActiveTaskStatus(taskInfo.status) && (
                <Tag color="processing">
                  自动刷新 · {TASK_STATUS_POLL_INTERVAL_MS / 1000}s
                </Tag>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="训练进度">
            {typeof taskInfo.progress === 'number'
              ? `${taskInfo.progress}%`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="总耗时">
            {taskInfo.duration || '-'}
          </Descriptions.Item>
          {taskLastUpdatedAt && (
            <Descriptions.Item label="状态更新时间">
              {taskLastUpdatedAt}
            </Descriptions.Item>
          )}
          {runId && (
            <Descriptions.Item label="MLflow Run ID" span={2}>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {runId}
              </span>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card
        id="version-history"
        title="版本历史（按 experimentId）"
        extra={
          experimentId ? (
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              共 {versions.length} 个版本 · experimentId={experimentId}
            </span>
          ) : null
        }
        style={{ marginBottom: 16 }}
      >
        {!experimentId && (
          <Alert
            type="warning"
            showIcon
            message="当前记录缺少 experimentId，无法加载版本历史"
          />
        )}
        {experimentId && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="版本与超参数说明"
            description="选择「追溯到此版本」可查看该次训练的配置快照。超参数为只读记录；需基于某一历史版本调整配置再训时，请使用「基于此版本继续训练」。"
          />
        )}
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={versions}
          rowClassName={(record) =>
            record.id === taskInfo.id ? 'ant-table-row-selected' : ''
          }
          locale={{
            emptyText: experimentId ? '暂无版本记录' : '缺少 experimentId',
          }}
          columns={[
            {
              title: '版本',
              dataIndex: 'versionNo',
              width: 80,
              render: (v, record) => (
                <Space size={4}>
                  {`v${v}`}
                  {record.id === taskInfo.id ? (
                    <Tag color="blue">当前</Tag>
                  ) : null}
                </Space>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (s: string) => (
                <Tag color={statusColor(s)}>{statusText(s)}</Tag>
              ),
            },
            {
              title: '代码模型版本',
              dataIndex: 'codeVersionId',
              ellipsis: true,
              render: (v: any) => (
                <Tooltip title={v || ''}>
                  <span>{v || '-'}</span>
                </Tooltip>
              ),
            },
            {
              title: '数据集版本',
              dataIndex: 'datasetVersionId',
              ellipsis: true,
              render: (v: any) => (
                <Tooltip title={v || ''}>
                  <span>
                    {getDatasetVersionDisplayLabel(v ? String(v) : undefined)}
                  </span>
                </Tooltip>
              ),
            },
            {
              title: '超参数',
              dataIndex: 'hyperParams',
              ellipsis: true,
              render: (hp: any) => renderHyperParamsCell(hp),
            },
            {
              title: '备注',
              dataIndex: 'remark',
              width: 140,
              ellipsis: true,
              render: (v: any) => v || '-',
            },
            { title: '时间', dataIndex: 'createdAt', width: 170 },
            {
              title: '操作',
              key: 'action',
              width: 240,
              fixed: 'right',
              render: (_: any, record: API.TrainingExperimentVersion) => (
                <Space size={0} wrap={false}>
                  <Button
                    type="link"
                    style={{ paddingLeft: 0 }}
                    onClick={() => handleTraceVersion(record.id)}
                  >
                    {record.id === taskInfo.id ? '当前追溯' : '追溯到此版本'}
                  </Button>
                  <Button
                    type="link"
                    style={{ paddingInline: 4 }}
                    onClick={() => handleContinueSameExperiment(record)}
                  >
                    基于此版本继续训练
                  </Button>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        {
                          key: 'remark',
                          label: '修改备注',
                          onClick: () => openUpdateRemark(record),
                        },
                        {
                          key: 'pool',
                          label: '加入对比池',
                          onClick: () => {
                            const next = saveComparePool([
                              record.id,
                              ...loadComparePool(),
                            ]);
                            message.success(
                              `已加入对比池（共 ${next.length} 条）`,
                            );
                          },
                        },
                      ],
                    }}
                  >
                    <Button type="text" size="small" icon={<MoreOutlined />} />
                  </Dropdown>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={`修改 v${remarkBase?.versionNo ?? ''} 备注`}
        open={remarkModalOpen}
        onCancel={() => {
          setRemarkModalOpen(false);
          setRemarkBase(null);
          remarkForm.resetFields();
        }}
        onOk={submitRemarkModal}
        confirmLoading={remarkModalLoading}
        okText="保存备注"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ marginBottom: 12, color: '#8c8c8c', fontSize: 12 }}>
          仅更新备注说明，不会修改该版本已记录的超参数配置。
        </div>
        <Form form={remarkForm} layout="vertical">
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="版本说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Card
        title="同一实验 · 多版本对比"
        extra={
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>
            与上方「版本历史」同源：按 experimentId 聚合的各次迭代记录
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
          勾选本实验下至少 2
          个版本，跳转到「模型性能对比」查看曲线与指标差异（各版本对应一条训练记录
          id）。
        </div>
        <Table<API.TrainingExperimentVersion>
          size="small"
          rowKey="id"
          columns={compareVersionColumns}
          dataSource={versions}
          pagination={false}
          locale={{ emptyText: '暂无版本记录' }}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: compareVersionKeys,
            onChange: setCompareVersionKeys,
          }}
        />
        <Space style={{ marginTop: 16 }}>
          <Button
            type="primary"
            onClick={handleCompareVersions}
            disabled={compareVersionKeys.length < 2}
          >
            对比选中版本
          </Button>
          <Button onClick={() => history.push('/task/compare')}>
            打开对比页（自选）
          </Button>
        </Space>
      </Card>

      {isConsistencyProfileTask(taskInfo.metrics) && (
        <Card
          title="图文一致性训练指标"
          extra={
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              训练方案：图文一致性基线训练（{CONSISTENCY_PROFILE}）
            </span>
          }
          style={{ marginBottom: 16 }}
        >
          <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={buildConsistencyMetricsRows(taskInfo.metrics)}
            columns={[
              { title: '数据集', dataIndex: 'split', width: 80 },
              {
                title: '样本数',
                dataIndex: 'rows',
                width: 80,
                render: (_: unknown, record: any) => (
                  <Tooltip
                    title={`正样本 ${record.positive} / 负样本 ${record.negative}`}
                  >
                    <span>{record.rows}</span>
                  </Tooltip>
                ),
              },
              ...CONSISTENCY_METRIC_KEYS.map((metric) => ({
                title: metric,
                dataIndex: metric,
                render: (v: string) => (
                  <span style={{ fontFamily: 'monospace' }}>{v}</span>
                ),
              })),
            ]}
          />
        </Card>
      )}

      <Card
        title="训练指标可视化（MLflow）"
        extra={
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>
            优先使用后端返回的 runId；无数据时可手动输入
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <TrainingMetricsPanel
          runId={runId}
          taskStatus={taskInfo.status}
          progress={taskInfo.progress}
          backendMetrics={taskInfo.metrics}
          runIdInput={runIdInput}
          onRunIdInputChange={setRunIdInput}
          onManualRunId={(rid) => {
            if (!rid) {
              message.warning('请输入 Run ID');
              return;
            }
            setManualRunId(rid);
          }}
        />
      </Card>

      <Card title="训练产物" style={{ marginBottom: 16 }}>
        <TrainingArtifactsList
          outputPath={taskInfo.outputPath}
          logPath={taskInfo.logPath}
          files={taskInfo.files}
        />
      </Card>
    </PageContainer>
  );
};

const TrainingArtifactsList: React.FC<{
  outputPath?: string;
  logPath?: string;
  files?: { name: string; desc: string; objectName?: string }[];
}> = ({ outputPath, logPath, files }) => {
  const [downloadingKey, setDownloadingKey] = useState<string>();
  const consistencyItems = useMemo(
    () => buildConsistencyArtifactItems(outputPath, logPath),
    [outputPath, logPath],
  );
  const legacyItems = useMemo(() => {
    const list: { name: string; desc: string; objectName?: string }[] = [
      ...(files || []),
    ];
    if (logPath) {
      list.push({
        name: 'train.log',
        desc: logPath,
        objectName: minioPathToObjectName(logPath),
      });
    }
    if (outputPath) {
      const outputObjectName = minioPathToObjectName(outputPath);
      list.push({
        name: '训练输出目录',
        desc: outputPath,
        objectName: isLikelyDirectoryPath(outputPath)
          ? undefined
          : outputObjectName,
      });
    }
    return list;
  }, [files, logPath, outputPath]);

  const items = consistencyItems.length ? consistencyItems : legacyItems;

  if (!items.length) {
    return (
      <Alert
        type="info"
        showIcon
        message="暂无训练产物"
        description="任务完成后，产物文件（fusion_model.pkl、metrics.json、predictions、train.log 等）将在此展示。"
      />
    );
  }

  return (
    <List
      size="small"
      dataSource={items}
      renderItem={(item) => (
        <List.Item
          actions={
            item.objectName
              ? [
                  <Button
                    type="link"
                    key="download"
                    loading={downloadingKey === item.objectName}
                    onClick={async () => {
                      if (!item.objectName) return;
                      setDownloadingKey(item.objectName);
                      try {
                        const blob = await downloadObject(item.objectName);
                        triggerBlobDownload(blob, item.name);
                      } catch (error: any) {
                        message.error(
                          await errorMessageFromDownloadError(error),
                        );
                      } finally {
                        setDownloadingKey(undefined);
                      }
                    }}
                  >
                    下载
                  </Button>,
                ]
              : undefined
          }
        >
          <List.Item.Meta
            title={item.name}
            description={
              <Typography.Text
                copyable
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              >
                {item.desc}
              </Typography.Text>
            }
          />
        </List.Item>
      )}
    />
  );
};

export default TaskDetail;

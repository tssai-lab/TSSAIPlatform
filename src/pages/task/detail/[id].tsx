/**
 * 训练结果详情页 - Page 层
 * 任务信息、训练指标可视化（从 MLflow 获取）、结果文件列表
 * @see MLflow训练指标对接说明.md
 */

import { MoreOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useParams } from '@umijs/max';
import {
  Button,
  Card,
  Descriptions,
  Dropdown,
  Form,
  Input,
  List,
  Modal,
  message,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import * as echarts from 'echarts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MOCK_TASK_DETAIL } from '@/constants/mockData';
import {
  createExperimentVersion,
  fetchMlflowMetricsBulk,
  fetchTaskDetail,
  listExperimentVersions,
  updateExperimentHyperParams,
} from '@/services/platform';

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
  metrics?: {
    accuracy?: string;
    loss?: string;
    epochs?: string;
    batchSize?: string;
  };
  files?: { name: string; desc: string }[];
};

const METRIC_LABELS: Record<string, string> = {
  train_loss: '训练损失',
  val_accuracy: '验证准确率',
  val_mAP50: '验证 mAP50',
  val_mAP50_95: '验证 mAP50-95',
  box_loss: '边界框损失',
  cls_loss: '分类损失',
  dfl_loss: '分布焦点损失',
};

function buildDemoVersions(taskInfo: any): API.TrainingExperimentVersion[] {
  const experimentId = taskInfo?.experimentId || `exp-demo-${Date.now()}`;
  const modelVersionId =
    taskInfo?.modelVersionId || taskInfo?.modelId || 'model-ver-demo-001';
  const datasetVersionId =
    taskInfo?.datasetVersionId || taskInfo?.datasetId || 'dataset-ver-demo-001';
  const base: Omit<API.TrainingExperimentVersion, 'id' | 'versionNo'> = {
    experimentId,
    name: taskInfo?.name || 'ResNet50 · CIFAR10 训练',
    modelVersionId,
    datasetVersionId,
    codeVersionId: taskInfo?.codeVersionId || '代码 v0.1（baseline）',
    hyperParams: taskInfo?.hyperParams || {
      epochs: 10,
      batch_size: 32,
      learning_rate: 0.001,
    },
    status: taskInfo?.status || 'success',
    progress: 100,
    remark: taskInfo?.remark || '演示数据',
    createdAt: taskInfo?.createdAt || taskInfo?.createTime,
    updatedAt: taskInfo?.updatedAt || taskInfo?.createTime,
    createTime: taskInfo?.createTime,
  };
  return [
    {
      id: `${experimentId}-v1`,
      versionNo: 1,
      ...base,
      codeVersionId: base.codeVersionId,
      hyperParams: base.hyperParams,
      remark: 'baseline（演示）',
    },
    {
      id: `${experimentId}-v2`,
      versionNo: 2,
      ...base,
      codeVersionId: '代码 v0.2（增大 epochs）',
      hyperParams: {
        ...(base.hyperParams || {}),
        epochs: 20,
        batch_size: 64,
        learning_rate: 0.0005,
      },
      remark: '调参版本（演示）',
    },
    {
      id: `${experimentId}-v3`,
      versionNo: 3,
      ...base,
      codeVersionId: '代码 v0.3（调低 lr）',
      hyperParams: {
        ...(base.hyperParams || {}),
        epochs: 30,
        batch_size: 64,
        learning_rate: 0.0003,
      },
      remark: '进一步调参（演示）',
    },
  ];
}

function shortId(v?: string, keep = 10) {
  if (!v) return '-';
  if (v.length <= keep) return v;
  return `${v.slice(0, keep)}…`;
}

const TaskDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [taskInfo, setTaskInfo] = useState<TaskDetailInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [runIdInput, setRunIdInput] = useState('');
  const [manualRunId, setManualRunId] = useState('');
  const [metricsData, setMetricsData] = useState<
    Record<string, { step: number; value: number }[]>
  >({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [versions, setVersions] = useState<API.TrainingExperimentVersion[]>([]);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [versionModalMode, setVersionModalMode] = useState<'create' | 'remark'>(
    'create',
  );
  const [versionModalLoading, setVersionModalLoading] = useState(false);
  const [versionBase, setVersionBase] =
    useState<API.TrainingExperimentVersion | null>(null);
  const [versionForm] = Form.useForm();
  /** 同一实验下多版本对比：勾选版本记录 id */
  const [compareVersionKeys, setCompareVersionKeys] = useState<React.Key[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const demoExperimentIdRef = useRef<string>('');

  const runId = taskInfo?.runId || manualRunId;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchTaskDetail(id, { skipErrorHandler: true })
      .then((res) => {
        if (res?.data) {
          const data = res.data as TaskDetailInfo;
          data.runId = data.runId || (res.data as any).run_id;
          setTaskInfo(data);
        } else {
          setTaskInfo(MOCK_TASK_DETAIL as TaskDetailInfo);
        }
      })
      .catch(() => {
        setTaskInfo(MOCK_TASK_DETAIL as TaskDetailInfo);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!taskInfo) return;
    const experimentId = (taskInfo as any)?.experimentId;
    // 没有 experimentId 时也给演示数据，便于纯前端看效果
    if (!experimentId) {
      if (!demoExperimentIdRef.current) {
        demoExperimentIdRef.current = `exp-demo-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
      }
      const patched = {
        ...(taskInfo as any),
        experimentId: demoExperimentIdRef.current,
      };
      // 让页面“任务信息”里也能看到 experimentId，并用于跳转对比页
      setTaskInfo(patched);
      setVersions(buildDemoVersions(patched));
      return;
    }
    listExperimentVersions(experimentId, { skipErrorHandler: true })
      .then((res: any) => {
        const list = res?.data ?? [];
        setVersions(list?.length ? list : buildDemoVersions(taskInfo));
      })
      .catch(() => setVersions(buildDemoVersions(taskInfo)));
  }, [taskInfo]);

  const refreshVersions = async (experimentId: string) => {
    try {
      const res: any = await listExperimentVersions(experimentId, {
        skipErrorHandler: true,
      });
      const list = res?.data ?? [];
      setVersions(list?.length ? list : buildDemoVersions(taskInfo));
    } catch {
      setVersions(buildDemoVersions(taskInfo));
    }
  };

  const openCreateNextVersion = (record: API.TrainingExperimentVersion) => {
    setVersionModalMode('create');
    setVersionBase(record);
    versionForm.setFieldsValue({
      codeVersionId: record.codeVersionId,
      datasetVersionId: record.datasetVersionId,
      remark: `基于 v${record.versionNo} 迭代`,
      hyperParams: JSON.stringify(record.hyperParams ?? {}, null, 2),
    });
    setVersionModalOpen(true);
  };

  const openUpdateRemark = (record: API.TrainingExperimentVersion) => {
    setVersionModalMode('remark');
    setVersionBase(record);
    versionForm.setFieldsValue({
      remark: record.remark || '',
    });
    setVersionModalOpen(true);
  };

  const submitVersionModal = async () => {
    const experimentId =
      (taskInfo as any)?.experimentId || versionBase?.experimentId;
    if (!experimentId || !versionBase) {
      message.warning('缺少 experimentId，无法迭代版本');
      return;
    }
    try {
      const values = await versionForm.validateFields();
      const hyperParams = values.hyperParams
        ? JSON.parse(values.hyperParams)
        : undefined;
      setVersionModalLoading(true);

      if (versionModalMode === 'create') {
        const res: any = await createExperimentVersion(
          experimentId,
          {
            codeVersionId: values.codeVersionId,
            datasetVersionId: values.datasetVersionId,
            hyperParams,
            remark: values.remark,
          },
          { skipErrorHandler: true },
        );
        message.success(`已创建新版本：v${res?.data?.versionNo ?? ''}`);
      } else {
        await updateExperimentHyperParams(
          experimentId,
          versionBase.versionNo,
          // 仅允许修改备注；超参数变更请走“迭代新版本”
          { hyperParams: versionBase.hyperParams, remark: values.remark },
          { skipErrorHandler: true },
        );
        message.success('已更新备注');
      }

      setVersionModalOpen(false);
      setVersionBase(null);
      versionForm.resetFields();
      await refreshVersions(experimentId);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.errorMessage || e?.message || '操作失败，请重试');
    } finally {
      setVersionModalLoading(false);
    }
  };

  useEffect(() => {
    if (!runId) return;
    setMetricsLoading(true);
    fetchMlflowMetricsBulk(runId)
      .then((data) => {
        setMetricsData(data);
      })
      .catch(() => {
        setMetricsData({});
      })
      .finally(() => setMetricsLoading(false));
  }, [runId]);

  useEffect(() => {
    if (!chartRef.current || !Object.keys(metricsData).length) return;

    const series = Object.entries(metricsData)
      .filter(([, points]) => points.length > 0)
      .map(([key, points]) => ({
        name: METRIC_LABELS[key] || key,
        type: 'line',
        smooth: true,
        data: points.map((p) => [p.step, p.value]),
      }));

    if (series.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    chartInstance.current.setOption({
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
  }, [metricsData]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!versions.length) {
      setCompareVersionKeys([]);
      return;
    }
    if (versions.length >= 2) {
      const first = versions[0]!;
      const last = versions[versions.length - 1]!;
      setCompareVersionKeys([first.id, last.id]);
      return;
    }
    const one = versions[0]!;
    setCompareVersionKeys(taskInfo?.id === one.id ? [one.id] : [one.id]);
  }, [versions, taskInfo?.id]);

  const handleLoadByRunId = () => {
    const rid = runIdInput.trim();
    if (!rid) {
      message.warning('请输入 Run ID');
      return;
    }
    setManualRunId(rid);
  };

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

  const hasCharts = Object.values(metricsData).some((arr) => arr.length > 0);

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
      title: '代码版本',
      dataIndex: 'codeVersionId',
      ellipsis: true,
      render: (v: any) => (
        <Tooltip title={v || ''}>
          <span>{v || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: '超参数',
      dataIndex: 'hyperParams',
      ellipsis: true,
      render: (hp: any) => {
        const epochs = hp?.epochs ?? hp?.num_epochs;
        const batch = hp?.batch_size ?? hp?.batch;
        const lr = hp?.learning_rate ?? hp?.lr0;
        const txt = `epochs=${epochs ?? '-'}，batch=${batch ?? '-'}，lr=${lr ?? '-'}`;
        return (
          <Tooltip title={JSON.stringify(hp ?? {}, null, 2)}>
            <span>{txt}</span>
          </Tooltip>
        );
      },
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
    const experimentId = (taskInfo as any)?.experimentId;
    const qs = new URLSearchParams();
    if (experimentId) qs.set('experimentId', String(experimentId));
    qs.set('ids', (compareVersionKeys as string[]).join(','));
    history.push(`/task/compare?${qs.toString()}`);
  };

  return (
    <PageContainer
      title="训练结果详情"
      subTitle="查看训练任务的详细信息和 MLflow 训练指标"
      onBack={() => history.push('/task/list')}
      extra={
        <Button onClick={() => history.push('/task/list')}>返回列表</Button>
      }
    >
      <Card title="任务信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="任务名称">
            <strong>{taskInfo.name}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="实验ID">
            {(taskInfo as any).experimentId || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="版本号">
            {(taskInfo as any).versionNo ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="模型">
            {taskInfo.modelName}
          </Descriptions.Item>
          <Descriptions.Item label="数据集">
            {taskInfo.datasetName}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {taskInfo.createTime}
          </Descriptions.Item>
          <Descriptions.Item label="完成时间">
            {taskInfo.completeTime || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag
              color={
                taskInfo.status === 'success'
                  ? 'success'
                  : taskInfo.status === 'running'
                    ? 'processing'
                    : taskInfo.status === 'failed'
                      ? 'error'
                      : 'default'
              }
            >
              {taskInfo.status === 'success'
                ? '成功'
                : taskInfo.status === 'running'
                  ? '运行中'
                  : taskInfo.status === 'failed'
                    ? '失败'
                    : taskInfo.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="总耗时">
            {taskInfo.duration || '-'}
          </Descriptions.Item>
          {runId && (
            <Descriptions.Item label="MLflow Run ID" span={2}>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {runId}
              </span>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title="版本历史（按 experimentId）" style={{ marginBottom: 16 }}>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={versions}
          columns={[
            { title: '版本', dataIndex: 'versionNo', width: 70 },
            {
              title: '代码版本',
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
                <Tooltip title={`内部ID：${v || '-'}`}>
                  <span>{v ? `版本ID：${shortId(String(v), 12)}` : '-'}</span>
                </Tooltip>
              ),
            },
            {
              title: '超参数',
              dataIndex: 'hyperParams',
              ellipsis: true,
              render: (hp: any) => {
                const epochs = hp?.epochs ?? hp?.num_epochs;
                const batch = hp?.batch_size ?? hp?.batch;
                const lr = hp?.learning_rate ?? hp?.lr0;
                const txt = `epochs=${epochs ?? '-'}，batch=${batch ?? '-'}，lr=${lr ?? '-'}`;
                return (
                  <Tooltip title={JSON.stringify(hp ?? {}, null, 2)}>
                    <span>{txt}</span>
                  </Tooltip>
                );
              },
            },
            {
              title: '备注',
              dataIndex: 'remark',
              width: 160,
              ellipsis: true,
              render: (v: any) => v || '-',
            },
            { title: '时间', dataIndex: 'createdAt', width: 180 },
            {
              title: '操作',
              key: 'action',
              width: 120,
              fixed: 'right',
              render: (_: any, record: any) => (
                <Space size={4} wrap={false}>
                  <Button
                    type="link"
                    onClick={() => {
                      localStorage.setItem(
                        'taskCreatePrefill',
                        JSON.stringify({
                          modelVersionId: record.modelVersionId,
                          datasetVersionId: record.datasetVersionId,
                          codeVersionId: record.codeVersionId,
                          hyperParams: JSON.stringify(
                            record.hyperParams ?? {},
                            null,
                            2,
                          ),
                        }),
                      );
                      history.push('/task/create');
                    }}
                  >
                    回填
                  </Button>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
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
                        {
                          key: 'iterate',
                          label: '迭代新版本',
                          onClick: () => openCreateNextVersion(record),
                        },
                        {
                          key: 'remark',
                          label: '修改备注',
                          onClick: () => openUpdateRemark(record),
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
        title={
          versionModalMode === 'create' ? '迭代新版本（同一实验）' : '修改备注'
        }
        open={versionModalOpen}
        onCancel={() => {
          setVersionModalOpen(false);
          setVersionBase(null);
          versionForm.resetFields();
        }}
        onOk={submitVersionModal}
        confirmLoading={versionModalLoading}
        okText={versionModalMode === 'create' ? '创建新版本' : '保存备注'}
        cancelText="取消"
        width={720}
      >
        <div style={{ marginBottom: 12, color: '#8c8c8c', fontSize: 12 }}>
          {versionModalMode === 'create'
            ? '修改超参数会产生新版本（versionNo 递增）。未填写的字段后端会继承最新版本。'
            : '仅用于修正说明文本，不会产生新版本。超参数变更请使用“迭代新版本”。'}
        </div>
        <Form form={versionForm} layout="vertical">
          {versionModalMode === 'create' && (
            <>
              <Form.Item
                name="codeVersionId"
                label="代码版本"
                rules={[{ required: true, message: '请输入代码版本' }]}
              >
                <Input placeholder="例如：代码 v0.2（增大 epochs）" />
              </Form.Item>
              <Form.Item
                name="datasetVersionId"
                label="数据集版本（ID）"
                rules={[{ required: true, message: '请输入数据集版本ID' }]}
              >
                <Input placeholder="例如：dataset-ver-xxxx（后续可改成下拉选择）" />
              </Form.Item>
            </>
          )}
          <Form.Item name="remark" label="备注（可选）">
            <Input
              placeholder={
                versionModalMode === 'create'
                  ? '例如：基于 v1 迭代'
                  : '例如：修正备注描述'
              }
            />
          </Form.Item>
          {versionModalMode === 'create' && (
            <Form.Item
              name="hyperParams"
              label="超参数（JSON）"
              rules={[
                { required: true, message: '请输入超参数 JSON' },
                {
                  validator: async (_: any, v: any) => {
                    try {
                      JSON.parse(v || '');
                      return Promise.resolve();
                    } catch {
                      return Promise.reject(new Error('JSON 格式不正确'));
                    }
                  },
                },
              ]}
            >
              <Input.TextArea
                rows={10}
                placeholder='{"epochs": 10, "batch_size": 32, "learning_rate": 0.001}'
              />
            </Form.Item>
          )}
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

      <Card
        title="训练指标可视化"
        extra={
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>
            数据来自独立 MLflow 服务，需启动 mlflow server 并写入指标
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        {!runId ? (
          <div style={{ padding: 24, background: '#fafafa', borderRadius: 8 }}>
            <div style={{ marginBottom: 12, color: '#8c8c8c' }}>
              任务详情未包含 run_id，或后端尚未返回。可手动输入 MLflow Run ID
              进行联调：
            </div>
            <Input.Search
              placeholder="输入 MLflow Run ID（如 abc123...）"
              value={runIdInput}
              onChange={(e) => setRunIdInput(e.target.value)}
              onSearch={handleLoadByRunId}
              enterButton="加载指标"
              style={{ maxWidth: 480 }}
            />
          </div>
        ) : (
          <>
            {metricsLoading ? (
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
              <div ref={chartRef} style={{ height: 400, width: '100%' }} />
            ) : (
              <div
                style={{
                  height: 400,
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
                    暂无指标数据
                  </div>
                  <div style={{ fontSize: 12 }}>
                    请确保 MLflow 服务已启动，且该 run_id 下已写入 metrics（如
                    train_loss、val_accuracy）
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {taskInfo.metrics && (
          <div
            style={{
              marginTop: 24,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            {taskInfo.metrics.accuracy && (
              <div
                style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}
              >
                <div
                  style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}
                >
                  最终准确率
                </div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>
                  {taskInfo.metrics.accuracy}
                </div>
              </div>
            )}
            {taskInfo.metrics.loss && (
              <div
                style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}
              >
                <div
                  style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}
                >
                  最终损失值
                </div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>
                  {taskInfo.metrics.loss}
                </div>
              </div>
            )}
            {taskInfo.metrics.epochs && (
              <div
                style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}
              >
                <div
                  style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}
                >
                  训练轮数
                </div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>
                  {taskInfo.metrics.epochs}
                </div>
              </div>
            )}
            {taskInfo.metrics.batchSize && (
              <div
                style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}
              >
                <div
                  style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}
                >
                  批次大小
                </div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>
                  {taskInfo.metrics.batchSize}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {taskInfo.files && taskInfo.files.length > 0 && (
        <Card title="结果文件">
          <List
            dataSource={taskInfo.files}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button type="link" key="download">
                    下载
                  </Button>,
                ]}
              >
                <List.Item.Meta title={item.name} description={item.desc} />
              </List.Item>
            )}
          />
        </Card>
      )}
    </PageContainer>
  );
};

export default TaskDetail;
